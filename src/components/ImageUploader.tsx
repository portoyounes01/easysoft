import React, { useState, useRef, useCallback } from 'react';
import {
    Upload,
    Link,
    Eye,
    Trash2,
    Copy,
    AlertCircle,
    Loader2,
    X
} from 'lucide-react';
import { supabase, connectionStatus } from '../lib/supabase';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';

// Image optimization configuration
const IMAGE_CONFIG = {
    // Maximum dimensions for resized images
    MAX_WIDTH: 800,
    MAX_HEIGHT: 800,
    // JPEG compression quality (0.1 to 1.0)
    QUALITY: 0.85,
    // Alternative quality for very large images
    AGGRESSIVE_QUALITY: 0.7,
    // Alternative dimensions for very large images
    AGGRESSIVE_MAX_WIDTH: 600,
    AGGRESSIVE_MAX_HEIGHT: 600,
    // Maximum file sizes
    MAX_UPLOAD_SIZE: 10 * 1024 * 1024, // 10MB before processing
    MAX_PROCESSED_SIZE: 2 * 1024 * 1024, // 2MB after processing (target)
} as const;

interface ImageUploaderProps {
    value: string;
    onChange: (url: string) => void;
    onError?: (error: string) => void;
    className?: string;
}

interface ImageUploadState {
    isUploading: boolean;
    uploadProgress: number;
    error: string | null;
    previewUrl: string | null;
    dragActive: boolean;
    originalSize?: number;
    optimizedSize?: number;
    imageWidth?: number;
    imageHeight?: number;
    storageMethod?: 'supabase' | 'base64' | 'url';
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
    value,
    onChange,
    onError,
    className = ''
}) => {
    // Note: Permission checks should be done at the component usage level
    // This component assumes the user already has inventory access

    // Auth context for upload proof and identity
    const { employee, credentialHash } = useSupabaseAuth();

    const [state, setState] = useState<ImageUploadState>({
        isUploading: false,
        uploadProgress: 0,
        error: null,
        previewUrl: value || null,
        dragActive: false,
        originalSize: undefined,
        optimizedSize: undefined,
        imageWidth: undefined,
        imageHeight: undefined,
        storageMethod: undefined
    });

    const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload');
    const [urlInput, setUrlInput] = useState(value || '');
    const [showPreview, setShowPreview] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const dropRef = useRef<HTMLDivElement>(null);

    // Validate URL function
    const isValidImageUrl = (url: string): boolean => {
        if (!url) return false;
        try {
            new URL(url);
            return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url);
        } catch {
            return false;
        }
    };

    // Get image dimensions from URL
    const getImageDimensions = useCallback((imageUrl: string) => {
        const img = new Image();
        img.onload = () => {
            setState(prev => ({
                ...prev,
                imageWidth: img.width,
                imageHeight: img.height
            }));
        };
        img.onerror = () => {
            setState(prev => ({
                ...prev,
                imageWidth: undefined,
                imageHeight: undefined
            }));
        };
        img.src = imageUrl;
    }, []);

    // Get file size for URL images (estimate from network request)
    const getUrlImageSize = useCallback(async (imageUrl: string) => {
        try {
            const response = await fetch(imageUrl, { method: 'HEAD' });
            const contentLength = response.headers.get('content-length');
            if (contentLength) {
                setState(prev => ({
                    ...prev,
                    originalSize: parseInt(contentLength, 10)
                }));
            }
        } catch (error) {
            // If HEAD request fails, try with range request
            try {
                const response = await fetch(imageUrl, {
                    headers: { 'Range': 'bytes=0-0' }
                });
                const contentRange = response.headers.get('content-range');
                if (contentRange) {
                    const totalSize = contentRange.split('/')[1];
                    if (totalSize && totalSize !== '*') {
                        setState(prev => ({
                            ...prev,
                            originalSize: parseInt(totalSize, 10)
                        }));
                    }
                }
            } catch (e) {
                // Size unavailable for external URLs
                console.warn('Could not determine file size for URL:', imageUrl);
            }
        }
    }, []);

    // Update preview when value changes
    React.useEffect(() => {
        setState(prev => ({ ...prev, previewUrl: value || null }));
        setUrlInput(value || '');

        // Get metadata if there's an initial value
        if (value && isValidImageUrl(value)) {
            getImageDimensions(value);
            getUrlImageSize(value);
        }
    }, [value, getImageDimensions, getUrlImageSize]);

    // Image resizing utility
    const resizeImage = (
        file: File,
        maxWidth: number = IMAGE_CONFIG.MAX_WIDTH,
        maxHeight: number = IMAGE_CONFIG.MAX_HEIGHT,
        quality: number = IMAGE_CONFIG.QUALITY
    ): Promise<File> => {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d')!;
            const img = new Image();

            img.onload = () => {
                // Calculate new dimensions
                let { width, height } = img;

                if (width > height) {
                    if (width > maxWidth) {
                        height = (height * maxWidth) / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = (width * maxHeight) / height;
                        height = maxHeight;
                    }
                }

                // Set canvas size
                canvas.width = width;
                canvas.height = height;

                // Draw and compress
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            const resizedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
                                type: 'image/jpeg', // Convert to JPEG for better compression
                                lastModified: Date.now(),
                            });
                            resolve(resizedFile);
                        } else {
                            resolve(file); // Fallback to original
                        }
                    },
                    'image/jpeg',
                    quality
                );
            };

            img.onerror = () => {
                resolve(file); // Fallback to original if processing fails
            };

            img.src = URL.createObjectURL(file);
        });
    };

    // Always use edge function to get signed upload URL, then upload directly
    const uploadViaSignedUrl = async (file: File): Promise<string> => {
        const { isOnline, isSupabaseOnline } = connectionStatus.getStatus();
        if (!isOnline || !isSupabaseOnline) {
            throw new Error('Supabase unreachable');
        }
        if (!employee) {
            throw new Error('Not authenticated in POS');
        }

        // Request signed upload URL
        const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-image`;
        const reqBody = {
            employee_number: employee.employee_number,
            employee_id: employee.id,
            proof_hash: credentialHash || null,
            file_name: file.name,
            content_type: file.type
        };

        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const resp = await fetch(fnUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(reqBody)
        });

        if (!resp.ok) {
            const msg = await resp.text();
            const status = resp.status;
            if (status === 401 || status === 403) {
                throw new Error('Not authorized to upload images');
            }
            throw new Error(`Failed to get signed URL: ${msg}`);
        }

        const { uploadUrl, path } = await resp.json();

        // PUT file to signed URL
        const putResp = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': file.type,
            },
            body: file,
        });

        if (!putResp.ok) {
            throw new Error(`Signed upload failed: ${await putResp.text()}`);
        }

        // Get public URL if bucket is public; otherwise return path (caller may sign for display)
        const { data: urlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(path);
        return urlData.publicUrl || path;
    };

    // Handle file selection
    const handleFileSelect = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        const file = files[0];

        // Validate file type
        if (!file.type.startsWith('image/')) {
            const error = 'Please select an image file';
            setState(prev => ({ ...prev, error }));
            onError?.(error);
            return;
        }

        // Validate file size (max 10MB before processing)
        if (file.size > IMAGE_CONFIG.MAX_UPLOAD_SIZE) {
            const error = `Image size must be less than ${IMAGE_CONFIG.MAX_UPLOAD_SIZE / 1024 / 1024}MB`;
            setState(prev => ({ ...prev, error }));
            onError?.(error);
            return;
        }

        setState(prev => ({
            ...prev,
            isUploading: true,
            error: null,
            uploadProgress: 10,
            originalSize: file.size,
            optimizedSize: undefined
        }));

        try {
            // Resize image for optimization (unless it's SVG)
            let processedFile = file;
            if (file.type !== 'image/svg+xml') {
                setState(prev => ({ ...prev, uploadProgress: 20 }));
                processedFile = await resizeImage(file, IMAGE_CONFIG.MAX_WIDTH, IMAGE_CONFIG.MAX_HEIGHT, IMAGE_CONFIG.QUALITY);
                setState(prev => ({ ...prev, uploadProgress: 40 }));
            }

            setState(prev => ({ ...prev, optimizedSize: processedFile.size }));

            // Validate processed file size (max 2MB after processing)
            if (processedFile.size > IMAGE_CONFIG.MAX_PROCESSED_SIZE) {
                // Try with more aggressive compression
                if (file.type !== 'image/svg+xml') {
                    processedFile = await resizeImage(
                        file,
                        IMAGE_CONFIG.AGGRESSIVE_MAX_WIDTH,
                        IMAGE_CONFIG.AGGRESSIVE_MAX_HEIGHT,
                        IMAGE_CONFIG.AGGRESSIVE_QUALITY
                    );
                    setState(prev => ({ ...prev, uploadProgress: 50 }));
                }

                // If still too large, show warning but continue
                if (processedFile.size > IMAGE_CONFIG.MAX_PROCESSED_SIZE) {
                    console.warn('Processed image is still large:', processedFile.size / 1024 / 1024, 'MB');
                }
            }

            setState(prev => ({ ...prev, uploadProgress: 60 }));

            // First try to upload to Supabase
            try {
                const url = await uploadViaSignedUrl(processedFile);
                onChange(url);
                setState(prev => ({
                    ...prev,
                    isUploading: false,
                    previewUrl: url,
                    uploadProgress: 100,
                    storageMethod: 'supabase'
                }));
                // Get dimensions after successful upload
                getImageDimensions(url);
                return;
            } catch (supabaseError) {
                const message = supabaseError instanceof Error ? supabaseError.message : String(supabaseError);
                const isAuthError = /Not authorized|401|403|permission|unauthor/i.test(message);
                const { isOnline, isSupabaseOnline } = connectionStatus.getStatus();
                if (isAuthError) {
                    setState(prev => ({ ...prev, isUploading: false, error: 'Not authorized to upload images. Contact your manager or admin.' }));
                    onError?.('Not authorized to upload images.');
                    return;
                }
                if (!(isOnline && isSupabaseOnline)) {
                    console.warn('Supabase unreachable, falling back to base64:', supabaseError);
                } else {
                    console.warn('Upload failed:', supabaseError);
                }

                setState(prev => ({ ...prev, uploadProgress: 80 }));

                // Fallback to base64 data URL with processed (smaller) file
                // This only happens when Supabase is unreachable, not for permission issues
                const reader = new FileReader();
                reader.onload = (e) => {
                    const dataUrl = e.target?.result as string;
                    onChange(dataUrl);
                    setState(prev => ({
                        ...prev,
                        isUploading: false,
                        previewUrl: dataUrl,
                        uploadProgress: 100,
                        storageMethod: 'base64'
                    }));
                    // Get dimensions after successful fallback
                    getImageDimensions(dataUrl);
                };
                reader.readAsDataURL(processedFile);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Upload failed';
            setState(prev => ({
                ...prev,
                isUploading: false,
                error: errorMessage
            }));
            onError?.(errorMessage);
        }
    }, [onChange, onError]);

    // Handle drag and drop
    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDragIn = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setState(prev => ({ ...prev, dragActive: true }));
    }, []);

    const handleDragOut = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setState(prev => ({ ...prev, dragActive: false }));
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setState(prev => ({ ...prev, dragActive: false }));

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files);
        }
    }, [handleFileSelect]);

    // Format file size in human readable format
    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    // Handle URL input
    const handleUrlSubmit = () => {
        if (!urlInput.trim()) {
            onChange('');
            setState(prev => ({ ...prev, previewUrl: null, error: null, storageMethod: undefined }));
            return;
        }

        if (isValidImageUrl(urlInput)) {
            onChange(urlInput);
            setState(prev => ({ ...prev, previewUrl: urlInput, error: null, storageMethod: 'url' }));
            // Get dimensions and size for URL images
            getImageDimensions(urlInput);
            getUrlImageSize(urlInput);
        } else {
            const error = 'Please enter a valid image URL';
            setState(prev => ({ ...prev, error }));
            onError?.(error);
        }
    };

    // Handle paste from clipboard
    const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    const fileList = new DataTransfer();
                    fileList.items.add(file);
                    await handleFileSelect(fileList.files);
                }
                break;
            }
        }
    }, [handleFileSelect]);

    // Clear image
    const clearImage = () => {
        onChange('');
        setUrlInput('');
        setState(prev => ({
            ...prev,
            previewUrl: null,
            error: null,
            originalSize: undefined,
            optimizedSize: undefined,
            imageWidth: undefined,
            imageHeight: undefined
        }));
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Mode Toggle */}
            <div className="flex space-x-2 border-b border-gray-200">
                <button
                    type="button"
                    onClick={() => setInputMode('upload')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${inputMode === 'upload'
                        ? 'text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <Upload className="w-4 h-4 inline mr-2" />
                    Upload Image
                </button>
                <button
                    type="button"
                    onClick={() => setInputMode('url')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${inputMode === 'url'
                        ? 'text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <Link className="w-4 h-4 inline mr-2" />
                    Image URL
                </button>
            </div>

            {/* Upload Mode */}
            {inputMode === 'upload' && (
                <div className="space-y-4">
                    <div
                        ref={dropRef}
                        onDrop={handleDrop}
                        onDragOver={handleDrag}
                        onDragEnter={handleDragIn}
                        onDragLeave={handleDragOut}
                        onPaste={handlePaste}
                        className={`
                            relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
                            ${state.dragActive
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-300 hover:border-gray-400'
                            }
                            ${state.isUploading ? 'pointer-events-none' : 'cursor-pointer'}
                        `}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileSelect(e.target.files)}
                            className="hidden"
                        />

                        {state.isUploading ? (
                            <div className="space-y-2">
                                <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                                <p className="text-sm text-gray-600">Uploading image...</p>
                                {state.uploadProgress > 0 && (
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div
                                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                            style={{ width: `${state.uploadProgress}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Upload className="w-8 h-8 text-gray-400 mx-auto" />
                                <div>
                                    <p className="text-sm font-medium text-gray-700">
                                        Click to upload or drag & drop
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        PNG, JPG, GIF, SVG up to {IMAGE_CONFIG.MAX_UPLOAD_SIZE / 1024 / 1024}MB
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Images auto-resized to {IMAGE_CONFIG.MAX_WIDTH}x{IMAGE_CONFIG.MAX_HEIGHT}px for optimal storage
                                    </p>
                                    <p className="text-xs text-gray-400">
                                        You can also paste an image from clipboard
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* URL Mode */}
            {inputMode === 'url' && (
                <div className="space-y-3">
                    <div className="flex space-x-2">
                        <div className="flex-1 relative">
                            <Link className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="url"
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                onBlur={handleUrlSubmit}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleUrlSubmit();
                                    }
                                }}
                                placeholder="https://example.com/image.jpg"
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleUrlSubmit}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Apply
                        </button>
                    </div>

                    <p className="text-xs text-gray-500">
                        Enter a direct link to an image file (jpg, png, gif, webp, svg)
                    </p>
                </div>
            )}

            {/* Error Display */}
            {state.error && (
                <div className="flex items-start space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-red-700">{state.error}</span>
                </div>
            )}

            {/* Image Preview */}
            {state.previewUrl && (
                <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">Preview</label>
                    <div className="relative group">
                        <div className="aspect-square max-w-[200px] relative rounded-lg overflow-hidden border border-gray-200">
                            <img
                                src={state.previewUrl}
                                alt="Product preview"
                                className="w-full h-full object-cover"
                                onError={() => {
                                    setState(prev => ({ ...prev, error: 'Failed to load image' }));
                                }}
                            />

                            {/* Image Actions Overlay */}
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 flex items-center justify-center">
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex space-x-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowPreview(true)}
                                        className="p-2 bg-white rounded-full hover:bg-gray-100 transition-colors"
                                        title="View full size"
                                    >
                                        <Eye className="w-4 h-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => navigator.clipboard.writeText(state.previewUrl!)}
                                        className="p-2 bg-white rounded-full hover:bg-gray-100 transition-colors"
                                        title="Copy URL"
                                    >
                                        <Copy className="w-4 h-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={clearImage}
                                        className="p-2 bg-white rounded-full hover:bg-gray-100 transition-colors"
                                        title="Remove image"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-2 text-xs text-gray-500 break-all">
                            {state.previewUrl.length > 60
                                ? `${state.previewUrl.substring(0, 60)}...`
                                : state.previewUrl
                            }
                        </div>

                        {/* Image Metadata */}
                        <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                    <span className="font-medium text-gray-600">Dimensions:</span>
                                    <div className="text-gray-700">
                                        {state.imageWidth && state.imageHeight
                                            ? `${state.imageWidth} × ${state.imageHeight}px`
                                            : 'Loading...'
                                        }
                                    </div>
                                </div>
                                <div>
                                    <span className="font-medium text-gray-600">File Size:</span>
                                    <div className="text-gray-700">
                                        {state.optimizedSize
                                            ? formatFileSize(state.optimizedSize)
                                            : state.originalSize
                                                ? formatFileSize(state.originalSize)
                                                : 'Unknown'
                                        }
                                    </div>
                                </div>
                            </div>

                            {/* Storage Method Indicator */}
                            {state.storageMethod && (
                                <div className="mt-2 pt-2 border-t border-gray-200">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium text-gray-600">Storage Method:</span>
                                        <div className="flex items-center gap-1">
                                            {state.storageMethod === 'supabase' && (
                                                <>
                                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                                    <span className="text-green-700 font-medium">Cloud Storage</span>
                                                </>
                                            )}
                                            {state.storageMethod === 'base64' && (
                                                <>
                                                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                                    <span className="text-yellow-700 font-medium">Local Data (Base64)</span>
                                                </>
                                            )}
                                            {state.storageMethod === 'url' && (
                                                <>
                                                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                    <span className="text-blue-700 font-medium">External URL</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Storage Method Indicator */}
                                    {state.storageMethod && (
                                        <div className="mt-2 pt-2 border-t border-gray-200">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-medium text-gray-600">Storage Method:</span>
                                                <div className="flex items-center gap-1">
                                                    {state.storageMethod === 'supabase' && (
                                                        <>
                                                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                                            <span className="text-green-700 font-medium">Cloud Storage</span>
                                                        </>
                                                    )}
                                                    {state.storageMethod === 'base64' && (
                                                        <>
                                                            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                                            <span className="text-yellow-700 font-medium">Local Data (Base64)</span>
                                                        </>
                                                    )}
                                                    {state.storageMethod === 'url' && (
                                                        <>
                                                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                            <span className="text-blue-700 font-medium">External URL</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Technical issue info for base64 fallback */}
                                            {state.storageMethod === 'base64' && (
                                                <div className="mt-1 text-xs text-yellow-600">
                                                    ⚠️ Cloud storage unavailable - saved locally
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Optimization Info */}
                        {state.originalSize && state.optimizedSize && state.originalSize !== state.optimizedSize && (
                            <div className="mt-2 p-2 bg-green-50 rounded-lg">
                                <div className="text-xs text-green-700">
                                    <span className="font-medium">Optimized:</span> {Math.round((1 - state.optimizedSize / state.originalSize) * 100)}% smaller
                                </div>
                                <div className="text-xs text-green-600">
                                    {formatFileSize(state.originalSize)} → {formatFileSize(state.optimizedSize)}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Full Size Preview Modal */}
            {showPreview && state.previewUrl && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
                    onClick={() => setShowPreview(false)}
                >
                    <div className="relative max-w-4xl max-h-full">
                        <button
                            onClick={() => setShowPreview(false)}
                            className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                        <img
                            src={state.previewUrl}
                            alt="Product preview"
                            className="max-w-full max-h-full object-contain rounded-lg"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImageUploader;
