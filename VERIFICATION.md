# Verification Guide

The Vercel-style Gemini Sidebar Extension has been built.

## How to Load in Chrome
1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top right toggle).
3. Click **Load unpacked**.
4. Select the `dist` folder at:
   `/Users/hesburger/Documents/incubator/gambapage/extension/dist`

## How to Test
1. **Navigate to EduPage**: Go to any `*.edupage.org` site (or open the local `edupage.html` if serving it).
2. **Find the Button**: Look for the **✨ AI** button in the top navigation bar ( EduBar QuickMenu).
3. **Click to Open**: The sidebar should slide in from the right.
4. **Resizing**: The main page content should shrink to make space for the sidebar (no overlap).
5. **API Key**: 
   - You will be prompted to enter a Gemini API Key.
   - You can get one from [Google AI Studio](https://makersuite.google.com/app/apikey).
   - Enter it and click "Save Key".
6. **Chat**: Try sending a message like "Help me with my homework".

## Troubleshooting
- **Button missing?** The extension targets `.edubarQuickmenu`. If the local HTML structure differs significantly from the live site, the selector might need adjustment.
- **API Error?** Ensure the API Key is valid and has access to `gemini-pro`.
