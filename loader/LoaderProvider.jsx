"use client";
import React, { createContext, useContext, useState, useEffect } from "react";
import "./loader.css";

// Create context
const LoaderContext = createContext(null);

// Linear progress component
const LinearProgressWithLabel = ({ value, showLabel = true, infinite = false }) => {
    return (
        <div className="w-full">
            <div className="flex items-center">
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden relative">
                    {infinite ? (
                        <div className="absolute h-2 rounded-full infinite-progress-bar"></div>
                    ) : (
                        <div
                            className="bg-indigo-600 h-2 rounded-full transition-all duration-300 ease-in-out"
                            style={{ width: `${value}%` }}
                        ></div>
                    )}
                </div>
                {showLabel && (
                    <span className="ml-2 text-xs font-medium text-gray-600">
                        {infinite ? "Loading..." : `${value}%`}
                    </span>
                )}
            </div>
        </div>
    );
};

// Loader Dialog Component
const LoaderDialog = ({ title, description, progress, autoProgress, infinite, showLabel, completionDelay, onComplete }) => {
    const [currentProgress, setCurrentProgress] = useState(progress || 0);

    useEffect(() => {
        if (!infinite && autoProgress) {
            const updateInterval = Math.max(1000 / (100 / 5), 500); // Adjust dynamically
            const timer = setInterval(() => {
                setCurrentProgress((prev) => {
                    const newProgress = Math.min(prev + 5, 100);
                    if (newProgress >= 100) {
                        clearInterval(timer);
                        setTimeout(() => onComplete && onComplete(), completionDelay);
                    }
                    return newProgress;
                });
            }, updateInterval);
            return () => clearInterval(timer);
        }
    }, [autoProgress, onComplete, infinite, completionDelay]);

    useEffect(() => {
        if (!infinite && progress !== undefined) {
            setCurrentProgress(progress);
            if (progress >= 100) {
                setTimeout(() => onComplete && onComplete(), completionDelay);
            }
        }
    }, [progress, onComplete, infinite, completionDelay]);

    return (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="animate-slide-up w-full max-w-md bg-white rounded-lg shadow-xl transform transition-all">
                <div className="bg-gradient-to-r from-indigo-600 to-blue-500 px-6 py-4">
                    <h3 className="text-lg font-semibold text-white">{title || "Processing Your Request"}</h3>
                </div>
                <div className="px-6 py-5">
                    <p className="text-gray-600 mb-6">
                        {description || "Please wait while we process your data. This may take a few moments."}
                    </p>
                    <LinearProgressWithLabel value={currentProgress} showLabel={showLabel} infinite={infinite} />
                </div>
            </div>
        </div>
    );
};

// Loader Provider Component
export const LoaderProvider = ({ children }) => {
    const [loaderState, setLoaderState] = useState({
        isVisible: false,
        title: "",
        description: "",
        progress: 0,
        autoProgress: false,
        infinite: false,
        showLabel: true,
        completionDelay: 800
    });

    const showLoader = (options = {}) => {
        setLoaderState({
            isVisible: true,
            title: options.title || "Processing",
            description: options.description || "Please wait while we process your request.",
            progress: options.progress || 0,
            autoProgress: options.autoProgress !== undefined ? options.autoProgress : true,
            infinite: options.infinite !== undefined ? options.infinite : false,
            showLabel: options.showLabel !== undefined ? options.showLabel : true,
            completionDelay: options.completionDelay || 800
        });
    };

    const updateLoader = (options = {}) => {
        setLoaderState((prev) => {
            // Only update if there is a real change
            const isDifferent = Object.keys(options).some((key) => prev[key] !== options[key]);
            return isDifferent ? { ...prev, ...options } : prev;
        });
    };
    
    const hideLoader = () => {
        setLoaderState((prev) => {
            // Only update if the visibility is true (if already false, no update)
            if (prev.isVisible) {
                return { ...prev, isVisible: false };
            }
            return prev;
        });
    };
    
    const handleComplete = () => hideLoader();

    // Function to execute a promise with the loader
    const withLoader = async (promise, options = {}) => {
        const {
            title = "Processing Request",
            description = "Please wait while we complete your request...",
            infinite = true,
            showLabel = false,
            completionDelay = 800,
        } = options;

        // Show infinite loader initially
        showLoader({ title, description, infinite, showLabel });

        try {
            const response = await promise;

            if (!response || !response.body) {
                hideLoader();
                return { data: null, error: new Error("Response has no body") };
            }

            // Get content length and content type
            const contentLength = response.headers.get("Content-Length");
            const contentType = response.headers.get("Content-Type");

            let totalBytes = contentLength ? parseInt(contentLength, 10) : null;
            let loadedBytes = 0;

            // If content length is available, show progress bar
            if (totalBytes) {
                updateLoader({ infinite: false, autoProgress: false, progress: 0, showLabel: true });
            }

            // Check if it's JSON (based on content type)
            if (contentType && contentType.includes("application/json")) {
                const jsonData = await response.json();
                hideLoader();
                return { data: jsonData, error: null }; // Return JSON response
            }

            // For non-JSON responses (files, etc.)
            const reader = response.body.getReader();
            const chunks = [];
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                chunks.push(value);
                loadedBytes += value.length;

                // If content length exists, update progress
                if (totalBytes) {
                    const progress = Math.round((loadedBytes / totalBytes) * 100);
                    updateLoader({ progress });
                }
            }

            // If progress was tracked, complete to 100%
            if (totalBytes) {
                updateLoader({ progress: 100 });
            }

            await new Promise((resolve) => setTimeout(resolve, completionDelay));
            hideLoader();

            // Combine all chunks into a single Uint8Array
            const allChunks = new Uint8Array(loadedBytes);
            let position = 0;
            
            for (const chunk of chunks) {
                allChunks.set(chunk, position);
                position += chunk.length;
            }

            // Return appropriate data based on content type
            if (contentType) {
                // For file responses, create a Blob and return it
                const fileBlob = new Blob([allChunks], { type: contentType });
                return { data: fileBlob, error: null };
            }

            // For text responses, decode the result
            const decoder = new TextDecoder();
            const textResult = decoder.decode(allChunks);
            return { data: textResult, error: null };
        } catch (error) {
            hideLoader();
            return { data: null, error };
        }
    };

    return (
        <LoaderContext.Provider value={{ showLoader, updateLoader, hideLoader, withLoader }}>
            {children}
            {loaderState.isVisible && (
                <LoaderDialog
                    title={loaderState.title}
                    description={loaderState.description}
                    progress={loaderState.progress}
                    autoProgress={loaderState.autoProgress}
                    infinite={loaderState.infinite}
                    showLabel={loaderState.showLabel}
                    completionDelay={loaderState.completionDelay}
                    onComplete={handleComplete}
                />
            )}
        </LoaderContext.Provider>
    );
};

// Custom Hook to use the loader
export const useLoader = () => {
    const context = useContext(LoaderContext);
    if (!context) {
        throw new Error("useLoader must be used within a LoaderProvider");
    }
    return context;
};