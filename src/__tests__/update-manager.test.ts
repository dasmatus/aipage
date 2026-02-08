
import { checkUpdates, initUpdateManager } from '../update-manager';

// Spy on console to avoid cluttering test output
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

// Mock global fetch
global.fetch = jest.fn() as any;
const mockFetch = global.fetch as unknown as jest.Mock;

// enhance the global chrome mock for our tests
const mockChrome = {
    ...global.chrome,
    alarms: {
        create: jest.fn(),
        onAlarm: {
            addListener: jest.fn(),
        },
    },
    notifications: {
        create: jest.fn(),
        onButtonClicked: {
            addListener: jest.fn(),
        },
        onClicked: {
            addListener: jest.fn(),
        },
        clear: jest.fn(),
    },
    downloads: {
        download: jest.fn(),
    },
    storage: {
        local: {
            get: jest.fn().mockResolvedValue({ autoUpdate: true }),
        }
    },
    runtime: {
        ...global.chrome.runtime,
        getManifest: jest.fn().mockReturnValue({ version: '1.0.0' }),
    }
};

(global as any).chrome = mockChrome;

describe('Update Manager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset storage mock to default 'true' for autoUpdate
        (mockChrome.storage.local.get as jest.Mock).mockResolvedValue({ autoUpdate: true });
        
        // Reset user agent
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
            configurable: true,
        });
    });

    describe('checkUpdates', () => {
        it('should do nothing if autoUpdate is disabled and not manual', async () => {
            (mockChrome.storage.local.get as jest.Mock).mockResolvedValue({ autoUpdate: false });
            
            await checkUpdates(false);
            
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should proceed if autoUpdate is disabled but manual check is true', async () => {
            (mockChrome.storage.local.get as jest.Mock).mockResolvedValue({ autoUpdate: false });
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ version: '1.0.0' }),
            });

            await checkUpdates(true);
            
            expect(mockFetch).toHaveBeenCalled();
        });

        it('should fetch manifest and do nothing if versions match (auto)', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ version: '1.0.0' }),
            });

            await checkUpdates(false);

            expect(mockFetch).toHaveBeenCalled();
            expect(mockChrome.notifications.create).not.toHaveBeenCalled();
        });

        it('should show "no-update" notification if versions match (manual)', async () => {
             mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ version: '1.0.0' }),
            });

            await checkUpdates(true);

            expect(mockChrome.notifications.create).toHaveBeenCalledWith(
                'no-update',
                expect.objectContaining({
                    title: 'AIPage is up to date',
                })
            );
        });

        it('should show update notification if new version available', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ version: '1.1.0' }),
            });

            await checkUpdates(false);

            expect(mockChrome.notifications.create).toHaveBeenCalledWith(
                'update-available',
                expect.objectContaining({
                    title: expect.stringContaining('1.1.0'),
                })
            );
        });

        it('should handle fetch errors gracefully (manual)', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            await checkUpdates(true);

            expect(mockChrome.notifications.create).toHaveBeenCalledWith(
                'update-error',
                expect.anything()
            );
        });

         it('should handle fetch errors gracefully (auto) - no notification', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            await checkUpdates(false);

            expect(mockChrome.notifications.create).not.toHaveBeenCalled();
        });

        it('should set up notification listeners for download', async () => {
             mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ version: '1.1.0' }), // version > 1.0.0
            });

            await checkUpdates(false);
            
            expect(mockChrome.notifications.onButtonClicked.addListener).toHaveBeenCalled();
            expect(mockChrome.notifications.onClicked.addListener).toHaveBeenCalled();
        });

        it('should trigger download when notification button is clicked', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ version: '2.0.0' }),
            });

            let buttonClickListener: (id: string, index: number) => void = () => {};
            (mockChrome.notifications.onButtonClicked.addListener as jest.Mock).mockImplementation((cb) => {
                buttonClickListener = cb;
            });

            await checkUpdates(false);

            // Simulate clicking 'Download' (index 0)
            buttonClickListener('update-available', 0);

            expect(mockChrome.downloads.download).toHaveBeenCalledWith(
                expect.objectContaining({
                    filename: 'aipage-update-2.0.0.zip',
                    url: expect.stringContaining('package:chrome'), // Default UA is chrome-like
                })
            );
            expect(mockChrome.notifications.clear).toHaveBeenCalledWith('update-available');
        });

         it('should trigger download when notification body is clicked', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ version: '2.0.0' }),
            });

            let clickListener: (id: string) => void = () => {};
            (mockChrome.notifications.onClicked.addListener as jest.Mock).mockImplementation((cb) => {
                clickListener = cb;
            });

            await checkUpdates(false);

            // Simulate clicking the notification body
            clickListener('update-available');

             expect(mockChrome.downloads.download).toHaveBeenCalledWith(
                expect.objectContaining({
                    filename: 'aipage-update-2.0.0.zip',
                    url: expect.stringContaining('package:chrome'),
                })
            );
             expect(mockChrome.notifications.clear).toHaveBeenCalledWith('update-available');
        });
    });

    describe('Browser Detection', () => {
        it('should download firefox artifact for Firefox UA', async () => {
             // Mock Firefox UA
             Object.defineProperty(navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0',
                configurable: true,
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ version: '2.0.0' }),
            });

            let clickListener: (id: string) => void = () => {};
             (mockChrome.notifications.onClicked.addListener as jest.Mock).mockImplementation((cb) => {
                clickListener = cb;
            });

            await checkUpdates(false);
            clickListener('update-available');

            expect(mockChrome.downloads.download).toHaveBeenCalledWith(
                expect.objectContaining({
                     url: expect.stringContaining('job=package:firefox'),
                })
            );
        });
         it('should download safari artifact for Safari UA', async () => {
             // Mock Safari UA
             Object.defineProperty(navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
                configurable: true,
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ version: '2.0.0' }),
            });

            let clickListener: (id: string) => void = () => {};
             (mockChrome.notifications.onClicked.addListener as jest.Mock).mockImplementation((cb) => {
                clickListener = cb;
            });

            await checkUpdates(false);
            clickListener('update-available');

            expect(mockChrome.downloads.download).toHaveBeenCalledWith(
                expect.objectContaining({
                     url: expect.stringContaining('job=package:safari'),
                })
            );
        });
    });

    describe('initUpdateManager', () => {
        it('should create an alarm and add listener', () => {
            initUpdateManager();
            
            expect(mockChrome.alarms.create).toHaveBeenCalledWith(
                'check_updates',
                expect.objectContaining({ periodInMinutes: 60 })
            );
            expect(mockChrome.alarms.onAlarm.addListener).toHaveBeenCalled();
        });

        it('should trigger checkUpdates on alarm', async () => {
            let alarmListener: (alarm: any) => void = () => {};
            (mockChrome.alarms.onAlarm.addListener as jest.Mock).mockImplementation((cb) => {
                alarmListener = cb;
            });

            initUpdateManager();

            // Simulate alarm
            alarmListener({ name: 'check_updates' });
            
            // Wait for async operations to complete
            await new Promise(resolve => setTimeout(resolve, 0));
            
            expect(mockFetch).toHaveBeenCalled(); 
        });
    });
});
