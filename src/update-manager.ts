
/**
 * Update Manager
 * Handles checking for updates from GitLab CI artifacts and prompting the user.
 */

const UPDATE_CHECK_ALARM = 'check_updates';
const CHECK_INTERVAL_MINUTES = 60;
const GITLAB_PROJECT_PATH = 'TenTypekMatus/aipage';
const GITLAB_API_BASE = 'https://gitlab.com';

interface RemoteManifest {
    version: string;
}

/**
 * Compare two semantic version strings.
 * Returns:
 * - 1 if v1 > v2
 * - -1 if v1 < v2
 * - 0 if v1 == v2
 */
function compareVersions(v1: string, v2: string): number {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
         const n1 = p1[i] || 0;
         const n2 = p2[i] || 0;
         if (n1 > n2) return 1;
         if (n1 < n2) return -1;
    }
    return 0;
}

/**
 * Determine the current browser type to select the correct artifact job.
 */
function getBrowserType(): 'chrome' | 'firefox' | 'safari' {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('firefox')) return 'firefox';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'safari';
    return 'chrome'; // Default to Chrome (includes Brave, Edge, etc.)
}

/**
 * Get the download URL for the latest artifact for the current browser.
 */
function getArtifactUrl(): string {
    const browserType = getBrowserType();
    let jobName = '';
    let artifactPath = '';

    switch (browserType) {
        case 'firefox':
            jobName = 'package:firefox';
            // Firefox artifact is a zip of XPIs, user has to unzip.
            // But usually we just give them the zip.
            return `${GITLAB_API_BASE}/${GITLAB_PROJECT_PATH}/-/artifacts/main/download?job=${jobName}`;
        case 'safari':
            jobName = 'package:safari';
            artifactPath = 'aipage-safari.zip';
            break;
        case 'chrome':
        default:
            jobName = 'package:chrome';
            artifactPath = 'aipage-chrome.zip';
            break;
    }

    // Direct raw download link for specific file in artifact
    return `${GITLAB_API_BASE}/${GITLAB_PROJECT_PATH}/-/artifacts/main/raw/${artifactPath}?job=${jobName}`;
}

/**
 * Check for updates against the GitLab repository.
 */
export async function checkUpdates(manual: boolean = false) {
    try {
        // 1. Check if auto-update is enabled (unless manual check)
        const { autoUpdate } = await chrome.storage.local.get('autoUpdate');
        if (!manual && !autoUpdate) return;

        // 2. Fetch remote package.json to check version
        const manifestUrl = `${GITLAB_API_BASE}/${GITLAB_PROJECT_PATH}/-/raw/main/extension/package.json`;
        const response = await fetch(manifestUrl);
        if (!response.ok) throw new Error('Failed to fetch remote manifest');
        
        const remoteManifest: RemoteManifest = await response.json();
        const currentVersion = chrome.runtime.getManifest().version;

        if (compareVersions(remoteManifest.version, currentVersion) > 0) {
            // New version available
            console.log(`Update available: ${remoteManifest.version} (current: ${currentVersion})`);
            
            // Notify user
            if (manual || autoUpdate) {
                chrome.notifications.create('update-available', {
                    type: 'basic',
                    iconUrl: 'assets/icon-128.png', // Assuming icon exists, or use default
                    title: `AIPage Update Available (${remoteManifest.version})`,
                    message: 'A new version is available. Click to download.',
                    buttons: [{ title: 'Download' }, { title: 'Dismiss' }],
                    requireInteraction: true
                });

                // Handle notification click
                chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
                    if (notificationId === 'update-available' && buttonIndex === 0) {
                        const url = getArtifactUrl();
                        chrome.downloads.download({ url, filename: `aipage-update-${remoteManifest.version}.zip` });
                        chrome.notifications.clear(notificationId);
                    }
                });
                
                 chrome.notifications.onClicked.addListener((notificationId) => {
                    if (notificationId === 'update-available') {
                        const url = getArtifactUrl();
                        chrome.downloads.download({ url, filename: `aipage-update-${remoteManifest.version}.zip` });
                        chrome.notifications.clear(notificationId);
                    }
                });

            }
        } else if (manual) {
             chrome.notifications.create('no-update', {
                type: 'basic',
                iconUrl: 'assets/icon-128.png',
                title: 'AIPage is up to date',
                message: `You are on the latest version (${currentVersion}).`,
            });
        }
    } catch (error) {
        console.error('Update check failed:', error);
        if (manual) {
             chrome.notifications.create('update-error', {
                type: 'basic',
                iconUrl: 'assets/icon-128.png',
                title: 'Update check failed',
                message: 'Could not check for updates. Check internet connection.',
            });
        }
    }
}

/**
 * Initialize update manager
 */
export function initUpdateManager() {
    // Set up alarm
    chrome.alarms.create(UPDATE_CHECK_ALARM, { periodInMinutes: CHECK_INTERVAL_MINUTES });
    
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === UPDATE_CHECK_ALARM) {
            checkUpdates();
        }
    });

    // Run check on startup if enabled
    checkUpdates(); 
}
