import React, { useRef, useState } from 'react';
import Tesseract from 'tesseract.js';
const TesseractLib = (typeof window !== 'undefined' && (window as any).Tesseract) ? (window as any).Tesseract : Tesseract;
import { t } from '../i18n';

interface OCRToolProps {
    onTextRecognized: (text: string) => void;
    language: string;
    detectedImages?: string[];
}

export const OCRTool: React.FC<OCRToolProps> = ({ onTextRecognized, language, detectedImages }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        await processImage(file);
        
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const processImage = async (image: File | Blob) => {
        setIsProcessing(true);
        setProgress(0);

        try {
            const result = await TesseractLib.recognize(
                image,
                language === 'sk' ? 'slk' : 'eng', // rudimentary mapping, maybe expand later
                {
                    logger: (m: { status: string; progress: number; }) => {
                        if (m.status === 'recognizing text') {
                            setProgress(Math.round(m.progress * 100));
                        }
                    }
                }
            );

            const text = result.data.text.trim();
            if (text) {
                onTextRecognized(text);
            } else {
                alert(t('alertOCRNoText', language) || 'No text found in image');
            }
        } catch (error) {
            console.error('OCR Error:', error);
            alert(t('alertOCRError', language) || 'Failed to process image');
        } finally {
            setIsProcessing(false);
            setProgress(0);
        }
    };

    const handlePaste = async () => {
        try {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                if (item.types.some(type => type.startsWith('image/'))) {
                    const blob = await item.getType(item.types.find(type => type.startsWith('image/'))!);
                    await processImage(blob);
                    return;
                }
            }
            alert(t('alertNoImageClipboard', language) || 'No image found in clipboard');
        } catch (e) {
            console.error('Clipboard read failed:', e);
            // Fallback to hidden input if permissions fail (though in extension popup it might be tricky)
            // But usually we can just ask user to use the file picker
        }
    };

    const processUrl = async (url: string) => {
        setIsProcessing(true);
        setProgress(0);
        
        try {
            // Fetch image through background proxy to bypass CORS
            const response: any = await chrome.runtime.sendMessage({
                action: 'proxy_fetch',
                payload: { url, method: 'GET' }
            });

            if (!response || !response.ok) throw new Error('Failed to fetch image');

            // response.data should be base64 data URL for images now
             await TesseractLib.recognize(
                response.data,
                language === 'sk' ? 'slk' : 'eng',
                {
                    logger: (m: { status: string; progress: number; }) => {
                         if (m.status === 'recognizing text') {
                              setProgress(Math.round(m.progress * 100));
                         }
                    }
                }
             ).then((result: { data: { text: string; }; }) => {
                  if (result.data.text.trim()) onTextRecognized(result.data.text.trim());
                  else alert(t('alertOCRNoText', language));
             });

        } catch (e) {
            console.error(e);
            alert(t('alertOCRError', language));
        } finally {
            setIsProcessing(false);
             setProgress(0);
        }
    };
    
    // Helper to process detected image
    const handleDetectedClick = () => {
        if (detectedImages && detectedImages.length > 0) {
            processUrl(detectedImages[0]); // Process first one for now
        }
    };

    return (
        <div className="ocr-tool" style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            <input 
                type="file" 
                ref={fileInputRef} 
                accept="image/*" 
                style={{ display: 'none' }} 
                onChange={handleFileChange}
            />
            
            <button 
                className="icon-btn" 
                onClick={() => fileInputRef.current?.click()}
                title={t('ocrUploadImage', language) || "Upload Image for OCR"}
                disabled={isProcessing}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
            </button>
            
            {detectedImages && detectedImages.length > 0 && (
                <button 
                    className="icon-btn"
                    onClick={handleDetectedClick}
                    title="OCR Detected Image"
                    style={{ position: 'relative' }}
                    disabled={isProcessing}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                         <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                         <polyline points="17 8 12 3 7 8"></polyline>
                         <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    <span style={{ 
                        position: 'absolute', top: -4, right: -4, 
                        background: 'red', color: 'white', 
                        fontSize: '9px', borderRadius: '50%', 
                        width: '12px', height: '12px', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center' 
                    }}>
                        {detectedImages.length}
                    </span>
                </button>
            )}

            {isProcessing && (
                <span style={{ fontSize: '10px', color: 'var(--eduba-body-text)' }}>
                    {progress}%
                </span>
            )}
        </div>
    );
};
