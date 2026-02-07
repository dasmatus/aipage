import React, { useRef, useState } from 'react';
import Tesseract from 'tesseract.js';
import { t } from '../i18n';

interface OCRToolProps {
    onTextRecognized: (text: string) => void;
    language: string;
}

export const OCRTool: React.FC<OCRToolProps> = ({ onTextRecognized, language }) => {
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
            const result = await Tesseract.recognize(
                image,
                language === 'sk' ? 'slk' : 'eng', // rudimentary mapping, maybe expand later
                {
                    logger: (m) => {
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
            
             {/* Optional: Paste button if we want explicit paste action, though User usually expects Ctrl+V in input 
                 For now, let's keep it simple with just upload button in the toolbar. 
                 Or maybe a "Camera" icon implies capturing/uploading.
             */}

            {isProcessing && (
                <span style={{ fontSize: '10px', color: 'var(--eduba-body-text)' }}>
                    {progress}%
                </span>
            )}
        </div>
    );
};
