/**
 * UI Utilities Module
 * Helpers for DOM manipulation and view management.
 */

import { ProviderType } from './providers';

/**
 * Toggles visibility of instruction boxes based on the selected provider.
 * @param {ProviderType} currentProvider 
 */
export function updateProviderInstructions(currentProvider: ProviderType) {
    const allInstructions = document.querySelectorAll('.provider-instructions');
    allInstructions.forEach(el => {
        const element = el as HTMLElement;
        const provider = element.dataset.provider;
        if (provider === currentProvider) {
            element.classList.remove('hidden');
        } else {
            element.classList.add('hidden');
        }
    });
}

/**
 * Shows or hides local settings fields (Base URL, Model Name).
 * @param {ProviderType} provider 
 * @param {HTMLElement} container 
 */
export function toggleLocalSettingsVisibility(provider: ProviderType, container: HTMLElement) {
    if (provider === 'lmstudio' || provider === 'ollama') {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
}

/**
 * Simple helper to switch between views.
 * @param {HTMLElement} toShow 
 * @param {HTMLElement} toHide 
 */
export function switchView(toShow: HTMLElement, toHide: HTMLElement) {
    toShow.classList.remove('hidden');
    toHide.classList.add('hidden');
}

/**
 * Auto-resizes a textarea based on its content.
 * @param {HTMLTextAreaElement} textarea 
 * @param {number} maxHeight 
 */
export function autoResizeTextarea(textarea: HTMLTextAreaElement, maxHeight: number = 120) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
}
