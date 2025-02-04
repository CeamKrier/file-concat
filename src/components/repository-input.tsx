import React, { useState, forwardRef, useImperativeHandle, useRef } from "react";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { Loader2, XCircle } from "lucide-react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import DownloadProgress from "./download-progress";

import { DownloadProgress as DownloadProgressType } from "../types";

interface RepositoryInputProps {
    onSubmit: (url: string, onProgress: (progress: DownloadProgressType) => void, signal: AbortSignal) => Promise<void>;
    isLoading: boolean;
}

export interface RepositoryInputRef {
    reset: () => void;
    abort: () => void;
}

const RepositoryInput = forwardRef<RepositoryInputRef, RepositoryInputProps>(({ onSubmit, isLoading }, ref) => {
    const [url, setUrl] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<DownloadProgressType>({
        currentFile: "",
        totalFiles: 0,
        completedFiles: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speed: 0
    });

    const abortControllerRef = useRef<AbortController | null>(null);

    // Expose the reset and abort methods through the ref
    useImperativeHandle(ref, () => ({
        reset: () => {
            setUrl("");
            setError(null);
            setProgress({
                currentFile: "",
                totalFiles: 0,
                completedFiles: 0,
                downloadedBytes: 0,
                totalBytes: 0,
                speed: 0
            });
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
        },
        abort: () => {
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
        }
    }));

    const validateUrl = (url: string): boolean => {
        // Basic validation for GitHub and GitLab URLs
        const githubRegex = /^https?:\/\/github\.com\/[\w-]+\/[\w.-]+$/;
        return githubRegex.test(url);
    };

    const handleAbort = () => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setError("Repository fetch aborted");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setProgress({
            currentFile: "",
            totalFiles: 0,
            completedFiles: 0,
            downloadedBytes: 0,
            totalBytes: 0,
            speed: 0
        });

        if (!validateUrl(url)) {
            setError("Please enter a valid GitHub repository URL");
            return;
        }

        try {
            // Create new abort controller for this request
            abortControllerRef.current = new AbortController();
            await onSubmit(url, setProgress, abortControllerRef.current.signal);
            abortControllerRef.current = null;
        } catch (error) {
            if (error instanceof Error) {
                if (error.name === "AbortError") {
                    setError("Repository fetch aborted");
                } else {
                    setError(error.message);
                }
            } else {
                setError("Failed to fetch repository");
            }
        }
    };

    return (
        <div className='space-y-4 p-4 border rounded-lg'>
            <div className='flex items-center gap-2'>
                <SiGithub className='w-5 h-5' />
                <Label>Public Repository URL</Label>
            </div>

            <form onSubmit={handleSubmit} className='flex gap-2'>
                <Input type='url' placeholder='https://github.com/username/repository' value={url} onChange={e => setUrl(e.target.value)} className='flex-1' disabled={isLoading} />
                {isLoading ? (
                    <>
                        <Button disabled variant='secondary'>
                            <Loader2 className='w-4 h-4 animate-spin' />
                            Fetching...
                        </Button>
                        <Button type='button' variant='destructive' onClick={handleAbort}>
                            <XCircle className='w-4 h-4' />
                            Abort
                        </Button>
                    </>
                ) : (
                    <Button type='submit' disabled={!url}>
                        Fetch Files
                    </Button>
                )}
            </form>

            {error && <p className='text-sm text-red-500'>{error}</p>}
            <DownloadProgress isLoading={isLoading} currentFile={progress.currentFile} totalFiles={progress.totalFiles} completedFiles={progress.completedFiles} downloadedBytes={progress.downloadedBytes} speed={progress.speed} totalBytes={progress.totalBytes} />
        </div>
    );
});

RepositoryInput.displayName = "RepositoryInput";

export default RepositoryInput;
