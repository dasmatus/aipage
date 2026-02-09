import browser from '../polyfills/browser-polyfill';
import { getNavbarHeight, getUserInitials } from './utils';

const NAVBAR_ID = 'edubar';

export class SidebarController {
    public isOpen = false;
    public currentWidth = 320;
    private iframe: HTMLIFrameElement | null = null;
    private resizer: HTMLDivElement | null = null;
    private isResizing = false;

    constructor() {}

    public toggle() {
        this.isOpen = !this.isOpen;
        if (this.isOpen) this.open();
        else this.close();
    }

    public open() {
        if (!this.iframe) this.createSidebarElements();
        const navbarHeight = getNavbarHeight();
        const topOffset = `${navbarHeight}px`;
        const heightCalc = `calc(100vh - ${navbarHeight}px)`;

        if (this.iframe) {
            this.iframe.style.top = topOffset;
            this.iframe.style.height = heightCalc;
            this.iframe.style.width = `${this.currentWidth}px`;
            this.iframe.style.right = '0px';
            this.iframe.style.display = 'block';
        }
        if (this.resizer) {
            this.resizer.style.top = topOffset;
            this.resizer.style.height = heightCalc;
            this.resizer.style.right = `${this.currentWidth}px`;
            this.resizer.style.display = 'block';
        }
        this.updateLayout(this.currentWidth);
    }

    public close() {
        if (this.iframe) this.iframe.style.right = `-${this.currentWidth}px`;
        if (this.resizer) this.resizer.style.display = 'none';
        this.updateLayout(0);
    }

    public updateLayout(width: number) {
        const widthCalc = width > 0 ? `calc(100% - ${width}px)` : '100%';
        const rightOffset = width > 0 ? `${width}px` : '0px';

        document.body.style.width = widthCalc;
        document.body.style.position = 'relative';
        document.body.style.transition = this.isResizing ? 'none' : 'width 0.3s ease';

        const navbar = document.getElementById(NAVBAR_ID);
        if (navbar) {
            navbar.style.width = widthCalc;
            navbar.style.transition = this.isResizing ? 'none' : 'width 0.3s ease';
        }

        const etestPlayer = document.querySelector('.etest-player') as HTMLElement;
        if (etestPlayer) {
            etestPlayer.style.width = widthCalc;
            etestPlayer.style.right = rightOffset;
            etestPlayer.style.transition = this.isResizing ? 'none' : 'width 0.3s ease, right 0.3s ease';
        }

        const mainContent = document.getElementById('bar_mainDiv');
        if (mainContent) {
            mainContent.style.width = '100%';
            mainContent.style.transition = this.isResizing ? 'none' : 'width 0.3s ease';
        }

        this.updateFloatingActionButtons(width);
    }

    private updateFloatingActionButtons(width: number) {
        const selectors = [
            '.etest-layout-next-button',
            '.gn-next-button',
            '.question-context-next',
            '.finish-button',
            '.sk-btn-floating',
            '.floating-action-button',
            '.btn-floating',
            '[class*="next-button"]', // Catch-all for next buttons
            '[class*="finish-test-button"]'
        ];

        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => this.moveElement(el as HTMLElement, width));
        });
    }

    private moveElement(el: HTMLElement, width: number) {
        if (!el.dataset.originalRight) {
            const computed = window.getComputedStyle(el);
            if (computed.position !== 'fixed' && computed.position !== 'absolute') return;
            el.dataset.originalRight = computed.right !== 'auto' ? computed.right : '20px';
        }
        
        const rightVal = parseInt(el.dataset.originalRight || '20');
        // If specific button class, we might need extra offset or just the width
        // Assuming the button is fixed to the right edge.
        el.style.right = width > 0 ? `${rightVal + width}px` : `${rightVal}px`;
        el.style.transition = this.isResizing ? 'none' : 'right 0.3s ease';
    }

    public cleanup() {
        this.iframe?.remove();
        this.resizer?.remove();
        this.iframe = null;
        this.resizer = null;
        this.isOpen = false;
    }

    private createSidebarElements() {
        // Double check to prevent duplicates
        document.getElementById('gemini-sidebar-frame')?.remove();
        document.getElementById('gemini-sidebar-resizer')?.remove();

        const initials = getUserInitials();

        this.iframe = document.createElement('iframe');
        this.iframe.id = 'gemini-sidebar-frame';
        this.iframe.src = browser.runtime.getURL('sidebar.html') + (initials ? `#initials=${initials}` : '');
        this.iframe.style.position = 'fixed';
        this.iframe.style.right = `-${this.currentWidth}px`;
        this.iframe.style.border = 'none';
        this.iframe.style.zIndex = '2147483646';
        this.iframe.style.boxShadow = '-4px 0 20px rgba(0,0,0,0.1)';
        this.iframe.style.transition = 'right 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        this.iframe.style.background = '#fff';

        this.resizer = document.createElement('div');
        this.resizer.id = 'gemini-sidebar-resizer';
        this.resizer.style.position = 'fixed';
        this.resizer.style.width = '4px';
        this.resizer.style.cursor = 'ew-resize';
        this.resizer.style.zIndex = '2147483647';
        this.resizer.style.background = 'transparent';
        this.resizer.style.display = 'none';

        this.resizer.addEventListener('mouseenter', () => { this.resizer!.style.background = 'rgba(46, 125, 50, 0.3)'; });
        this.resizer.addEventListener('mouseleave', () => { if (!this.isResizing) this.resizer!.style.background = 'transparent'; });

        this.resizer.addEventListener('mousedown', (e) => {
            this.isResizing = true;
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
            if (this.iframe) this.iframe.style.transition = 'none';

            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0'; overlay.style.bottom = '0'; overlay.style.left = '0'; overlay.style.right = '0';
            overlay.style.zIndex = '2147483648';
            overlay.style.cursor = 'ew-resize';
            document.body.appendChild(overlay);

            const startX = e.clientX;
            const startWidth = this.currentWidth;

            const onMouseMove = (moveEvent: MouseEvent) => {
                if (!this.isResizing) return;
                const deltaX = startX - moveEvent.clientX;
                const newWidth = Math.max(250, Math.min(450, startWidth + deltaX));

                this.currentWidth = newWidth;
                if (this.iframe) this.iframe.style.width = `${newWidth}px`;
                if (this.resizer) this.resizer.style.right = `${newWidth}px`;
                this.updateLayout(newWidth);
            };

            const onMouseUp = () => {
                this.isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                if (this.iframe) this.iframe.style.transition = 'right 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
                overlay.remove();
                browser.storage.local.set({ sidebarWidth: this.currentWidth });
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                if (this.resizer) this.resizer.style.background = 'transparent';
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        document.body.appendChild(this.iframe);
        document.body.appendChild(this.resizer);
    }
}
