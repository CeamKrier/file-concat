import React, { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Download, Shield, Trash2, PlusIcon, XIcon } from "lucide-react";
import { SiX } from "@icons-pack/react-simple-icons";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import RepositoryInput, { RepositoryInputRef } from "./components/repository-input";
import { ThemeToggle } from "./components/theme-toggle";

import { DownloadProgress, FileEntry, FileStatus, OutputFormat, ProcessingConfig } from "./types";
import { validateFile, formatSize, estimateTokenCount, fetchRepositoryFiles } from "./utils";
import { LLM_CONTEXT_LIMITS, MULTI_OUTPUT_LIMIT, DEFAULT_CONFIG } from "./constants";

import { cn } from "./lib/utils";
import OutputSettings from "./components/output-settings";

const App: React.FC = () => {
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [output, setOutput] = useState<string>("");
    const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [isRepoLoading, setIsRepoLoading] = useState<boolean>(false);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [isTableExpanded, setIsTableExpanded] = useState<boolean>(true);
    const [tokens, setTokens] = useState<number>(0);
    const [processedContents, setProcessedContents] = useState<Array<{ path: string; content: string }>>([]);
    const [recommendedFormat, setRecommendedFormat] = useState<OutputFormat>("single");
    const [selectedFormat, setSelectedFormat] = useState<OutputFormat | undefined>();
    const [config] = useState<ProcessingConfig>(DEFAULT_CONFIG);

    const [maxFileSize, setMaxFileSize] = useState<number>(32);

    const dragCounter = useRef<number>(0);
    const repositoryInputRef = useRef<RepositoryInputRef>(null);

    useEffect(() => {
        if (tokens > MULTI_OUTPUT_LIMIT) {
            setRecommendedFormat("multi");
        } else {
            setRecommendedFormat("single");
        }
    }, [tokens]);

    const processFile = useCallback(
        async (file: File, path: string): Promise<FileStatus> => {
            const validationResult = await validateFile(file, config);

            return {
                path,
                included: validationResult.isValid,
                reason: validationResult.reason,
                size: file.size,
                type: file.type || "text/plain",
                forceInclude: false
            };
        },
        [config]
    );

    const toggleFileInclusion = useCallback(
        async (index: number) => {
            try {
                // Create new statuses array with toggled status
                const newStatuses = fileStatuses.map((status, i) => (i === index ? { ...status, included: !status.included, forceInclude: !status.included } : status));
                setFileStatuses(newStatuses);

                // Use the new statuses to filter files
                const includedFiles = files.filter((_, i) => newStatuses[i].included);

                // Process the files - handle both repository and drag-dropped files
                const contents = await Promise.all(
                    includedFiles.map(async fileEntry => {
                        if (fileEntry.content) {
                            // Repository file
                            return {
                                path: fileEntry.path,
                                content: fileEntry.content
                            };
                        } else {
                            // Drag-dropped file
                            return {
                                path: fileEntry.path,
                                content: fileEntry.content
                            };
                        }
                    })
                );

                try {
                    // Update token count
                    const tokenCount = await estimateTokenCount(contents.map(c => c.content).join("\n"));
                    setTokens(tokenCount);
                } catch (error) {
                    console.error("Error estimating token count:", error);
                }

                // Update state
                setProcessedContents(contents);
            } catch (error) {
                console.error("Error reprocessing files:", error);
            }
        },
        [files, fileStatuses]
    );

    const handleRepositorySubmit = useCallback(
        async (url: string, onProgress: (progress: DownloadProgress) => void, signal: AbortSignal) => {
            setIsRepoLoading(true);
            try {
                const { files, error } = await fetchRepositoryFiles(url, onProgress, signal); // Pass signal to fetchRepositoryFiles

                if (error) {
                    throw new Error(error);
                }

                const fileEntries: FileEntry[] = [];
                const statuses: FileStatus[] = [];

                // Process each file from the repository
                for (const file of files) {
                    if (signal.aborted) {
                        // Check for abort signal during processing
                        throw new Error("Operation aborted");
                    }

                    const blob = new Blob([file.content || ""], { type: "text/plain" });
                    const fileObj = new File([blob], file.name, { type: "text/plain" });

                    const status = await processFile(fileObj, file.path);
                    statuses.push(status);

                    fileEntries.push({
                        file: fileObj,
                        path: file.path,
                        content: file.content || ""
                    });
                }

                // Set all files and statuses
                setFiles(fileEntries);
                setFileStatuses(statuses);

                // Filter for included files
                const includedFiles = fileEntries.filter((_, index) => statuses[index].included);

                // Create processed contents from included files
                const contents = includedFiles.map(({ path, content }) => ({
                    path,
                    content: content || ""
                }));

                try {
                    // Update token count
                    const tokenCount = await estimateTokenCount(contents.map(c => c.content).join("\n"));
                    setTokens(tokenCount);
                } catch (error) {
                    console.error("Error estimating token count:", error);
                }

                setProcessedContents(contents);
            } catch (error) {
                if (error instanceof Error && error.name === "AbortError") {
                    throw new Error("Repository fetch aborted");
                }
                throw error;
            } finally {
                setIsRepoLoading(false);
            }
        },
        [processFile]
    );

    const calculateChunks = useCallback(
        (contents: Array<{ path: string; content: string }>) => {
            const targetCharSize = maxFileSize * 1024; // Convert KB to bytes
            const chunks: (typeof contents)[] = [];
            let currentChunk: typeof contents = [];
            let currentSize = 0;

            // Process each file
            for (const file of contents) {
                const fileSize = new TextEncoder().encode(file.content).length; // Browser-safe size calculation

                // If adding this file would exceed the target size, start a new chunk
                if (currentSize + fileSize > targetCharSize && currentChunk.length > 0) {
                    chunks.push(currentChunk);
                    currentChunk = [];
                    currentSize = 0;
                }

                // If a single file is larger than target size, split its content
                if (fileSize > targetCharSize) {
                    const parts = Math.ceil(fileSize / targetCharSize);
                    for (let i = 0; i < parts; i++) {
                        const start = i * targetCharSize;
                        const end = Math.min((i + 1) * targetCharSize, fileSize);
                        chunks.push([
                            {
                                path: `${file.path} (part ${i + 1}/${parts})`,
                                content: file.content.slice(start, end)
                            }
                        ]);
                    }
                } else {
                    currentChunk.push(file);
                    currentSize += fileSize;
                }
            }

            // Add the last chunk if it has any files
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
            }

            return chunks;
        },
        [maxFileSize]
    );

    const generateOutput = useCallback(async () => {
        setIsProcessing(true);

        try {
            if (selectedFormat === "single") {
                const output = `# Files\n` + processedContents.map(({ path, content }) => `## ${path}\n\`\`\`\n${content}\n\`\`\`\n`).join("\n");

                const blob = new Blob([output], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "concat-output.md";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                const chunks = calculateChunks(processedContents);

                // Process and download chunks
                for (let i = 0; i < chunks.length; i++) {
                    const chunk = chunks[i];
                    const output = `# Files - Part ${i + 1}/${chunks.length}\n` + chunk.map(({ path, content }) => `## ${path}\n\`\`\`\n${content}\n\`\`\`\n`).join("\n");

                    const blob = new Blob([output], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `concat-output-part${i + 1}.md`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    // Small delay between downloads
                    if (i < chunks.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            }
        } catch (error) {
            console.error("Error generating output:", error);
        } finally {
            setIsProcessing(false);
        }
    }, [selectedFormat, processedContents, calculateChunks]);

    const resetAll = useCallback(() => {
        repositoryInputRef.current?.abort();
        setFiles([]);
        setOutput("");
        setFileStatuses([]);
        setIsProcessing(false);
        setIsRepoLoading(false);
        setTokens(0);
        setProcessedContents([]);
        setSelectedFormat(undefined);

        setMaxFileSize(32);
        repositoryInputRef.current?.reset();
    }, []);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current += 1;
        if (dragCounter.current === 1) {
            setIsDragging(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(
        async (e: React.DragEvent) => {
            resetAll();
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            dragCounter.current = 0;
            setIsProcessing(true);

            const items = e.dataTransfer.items;
            const fileEntries: FileEntry[] = [];
            const statuses: FileStatus[] = [];

            const processEntry = async (entry: FileSystemEntry, path = ""): Promise<void> => {
                if (entry.isFile) {
                    const fileEntry = entry as FileSystemFileEntry;
                    return new Promise(resolve => {
                        fileEntry.file(async file => {
                            const fullPath = path + file.name;
                            const status = await processFile(file, fullPath);

                            if (status.included) {
                                fileEntries.push({ file, path: fullPath, content: await file.text() });
                            }
                            statuses.push(status);
                            resolve();
                        });
                    });
                } else if (entry.isDirectory) {
                    const dirEntry = entry as FileSystemDirectoryEntry;
                    const dirReader = dirEntry.createReader();
                    return new Promise(resolve => {
                        dirReader.readEntries(async entries => {
                            const promises = entries.map(entry => processEntry(entry, path + entry.name + "/"));
                            await Promise.all(promises);
                            resolve();
                        });
                    });
                }
            };

            try {
                const promises = [];
                for (let i = 0; i < items.length; i++) {
                    const entry = items[i].webkitGetAsEntry();
                    if (entry) {
                        promises.push(processEntry(entry));
                    }
                }

                await Promise.all(promises);
                setFiles(fileEntries);
                setFileStatuses(statuses);

                // Automatically process files after they're dropped
                const contents = await Promise.all(
                    fileEntries.map(async ({ file, path }) => ({
                        file,
                        path,
                        content: await file.text()
                    }))
                );

                try {
                    // Update token count
                    const tokenCount = await estimateTokenCount(contents.map(c => c.content).join("\n"));
                    setTokens(tokenCount);
                } catch (error) {
                    console.error("Error estimating token count:", error);
                }

                // Store processed contents in state for later use
                setProcessedContents(contents);
            } catch (error) {
                console.error("Error processing files:", error);
            } finally {
                setIsProcessing(false);
            }
        },
        [resetAll, processFile]
    );

    const getEstimations = useCallback(() => {
        const chunks = calculateChunks(processedContents);
        const chunkSizes = chunks.map(chunk => chunk.reduce((acc, file) => acc + new TextEncoder().encode(file.content).length, 0));
        const avgSize = chunkSizes.length > 0 ? Math.ceil(chunkSizes.reduce((a, b) => a + b, 0) / chunkSizes.length) : 0;

        const multiple = `${chunks.length} files, ~${formatSize(avgSize)} each`;

        // For single file option display
        const totalSize = processedContents.reduce((acc, file) => acc + new TextEncoder().encode(file.content).length, 0);
        const single = `~${formatSize(totalSize)}`;

        return { single, multiple };
    }, [calculateChunks, processedContents]);

    return (
        <div className='p-4 max-w-4xl mx-auto'>
            <Card>
                <CardHeader>
                    <div className='flex justify-between items-start'>
                        <div>
                            <CardTitle className='flex items-center gap-2 mb-2'>
                                <img src='/logo.png' alt='Logo' className='w-8 h-8 dark:hidden' />
                                <img src='/dark-logo.png' alt='Logo' className='w-8 h-8 hidden dark:block' />
                                File Concat Tool
                            </CardTitle>
                            <CardDescription className='text-sm max-w-xl'>
                                Combine multiple files and folders into a single, well-formatted document optimized for Large Language Models (LLMs). Perfect for sharing codebases, documentation, and project structures with AI assistants like ChatGPT, Claude, and others.
                            </CardDescription>
                        </div>
                        <ThemeToggle />
                        <div className='flex flex-col gap-2'>
                            <div className='flex items-center gap-1 text-sm text-green-600 bg-muted px-1.5 py-1.5 rounded-md border border-green-200'>
                                <Shield className='w-4 h-4 fill-current' />
                                100% Offline Processing
                            </div>
                            <div className='flex items-center justify-center gap-2'>
                                <span className='text-sm text-muted-foreground'>Got feedback?</span>
                                <Button variant='ghost' asChild className='w-fit' size='sm'>
                                    <a className='w-fit' href='https://twitter.com/messages/compose?recipient_id=378117341' target='_blank'>
                                        <SiX className='w-4 h-4' />
                                    </a>
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <RepositoryInput ref={repositoryInputRef} isLoading={isRepoLoading} onSubmit={handleRepositorySubmit} />

                    <div className='flex items-center justify-center py-4'>or</div>

                    <div
                        onDragEnter={isProcessing || isRepoLoading ? undefined : handleDragEnter}
                        onDragLeave={isProcessing || isRepoLoading ? undefined : handleDragLeave}
                        onDragOver={isProcessing || isRepoLoading ? undefined : handleDragOver}
                        onDrop={isProcessing || isRepoLoading ? undefined : handleDrop}
                        className={`
        border-2 border-dashed rounded-lg p-8 text-center mb-4 
        transition-all duration-200
        ${isProcessing || isRepoLoading ? "opacity-50 cursor-not-allowed border-gray-200" : isDragging ? "border-blue-500 bg-muted" : "hover:border-blue-300"}
    `}>
                        <Upload
                            className={`w-12 h-12 mx-auto mb-4 transition-colors duration-200 
            ${isProcessing || isRepoLoading ? "text-gray-300" : isDragging ? "text-blue-500" : "text-gray-400"}`}
                        />
                        <p>{isProcessing ? "Processing files..." : isDragging ? "Drop files here" : "Drag and drop files or folders here"}</p>
                        {files.length > 0 && (
                            <div className='mt-2 text-sm text-muted-foreground'>
                                <p>{files.length} files selected</p>
                                <p>Total size: {formatSize(files.reduce((acc, { file }) => acc + file.size, 0))}</p>
                            </div>
                        )}
                    </div>

                    {(files.length > 0 || output) && (
                        <button onClick={resetAll} className='w-full justify-center px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2'>
                            <Trash2 className='w-4 h-4' />
                            Start Over
                        </button>
                    )}

                    {fileStatuses.length > 0 && (
                        <div className='mt-4 mb-4'>
                            <div className='flex justify-between items-center mb-4'>
                                <div className='space-y-1'>
                                    <h3 className='font-semibold'>Files Summary</h3>
                                    <p className='text-sm text-muted-foreground'>
                                        {fileStatuses.filter(s => s.included).length} files included,&nbsp;
                                        {fileStatuses.filter(s => !s.included).length} files excluded
                                    </p>
                                </div>
                                <button onClick={() => setIsTableExpanded(!isTableExpanded)} className='text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1'>
                                    {isTableExpanded ? "Hide Details" : "Show Details"}
                                </button>
                            </div>

                            {isTableExpanded && (
                                <div className='border relative rounded-lg max-h-80 overflow-y-auto'>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Status</TableHead>
                                                <TableHead>File</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Size</TableHead>
                                                <TableHead>Notes</TableHead>
                                                <TableHead>Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {fileStatuses.map((status, index) => (
                                                <TableRow key={index}>
                                                    <TableCell>
                                                        <span className={status.included ? "text-green-600" : "text-red-600"}>{status.included ? "Included" : "Excluded"}</span>
                                                    </TableCell>
                                                    <TableCell className='font-mono text-sm max-w-[200px]'>
                                                        <div className='truncate' title={status.path}>
                                                            {status.path}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>{status.type}</TableCell>
                                                    <TableCell>{formatSize(status.size)}</TableCell>
                                                    <TableCell>{status.reason || "-"}</TableCell>
                                                    <TableCell>
                                                        <Button
                                                            variant='outline'
                                                            className={cn(status.included ? "bg-red-600/80 hover:bg-red-700/80" : "bg-green-600/80 hover:bg-green-700/80", "text-white hover:text-white")}
                                                            size='sm'
                                                            onClick={() => toggleFileInclusion(index)}
                                                            disabled={isProcessing}>
                                                            {isProcessing ? (
                                                                <span className='flex items-center gap-2'>
                                                                    <span className='animate-spin h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full'></span>
                                                                    Processing...
                                                                </span>
                                                            ) : status.included ? (
                                                                <span className='flex items-center gap-2'>
                                                                    <XIcon className='w-4 h-4' />
                                                                    Exclude
                                                                </span>
                                                            ) : (
                                                                <span className='flex items-center gap-2'>
                                                                    <PlusIcon className='w-4 h-4' />
                                                                    Include
                                                                </span>
                                                            )}
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </div>
                    )}

                    {tokens > 0 && (
                        <div className='space-y-4'>
                            <div className='flex items-center justify-between'>
                                <h3 className='font-semibold'>Tokenization</h3>
                                <div className='flex items-center gap-4'>
                                    <div className='text-sm text-muted-foreground'>Estimated tokens: {tokens.toLocaleString()}</div>
                                </div>
                            </div>

                            {LLM_CONTEXT_LIMITS.map(llm => {
                                const percentage = (tokens / llm.limit) * 100;
                                return (
                                    <div key={llm.name} className='space-y-1'>
                                        <div className='flex justify-between text-sm'>
                                            <span>
                                                <span className='font-bold'>{llm.name}</span> - <span className='text-muted-foreground'>{llm.limit.toLocaleString()} tokens</span>
                                            </span>
                                            <span className={percentage > 100 ? "text-red-500" : "text-muted-foreground"}>{percentage.toFixed(1)}% used</span>
                                        </div>
                                        <div className='w-full bg-gray-200 rounded-full h-2'>
                                            <div className={`h-2 rounded-full ${percentage > 90 ? "bg-red-500" : percentage > 70 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min(percentage, 100)}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {processedContents.length > 0 && (
                        <div className='mt-6 space-y-6'>
                            <h3 className='font-semibold'>Output Format</h3>
                            <div className='grid grid-cols-2 gap-4'>
                                <button onClick={() => setSelectedFormat("single")} className={`p-4 rounded-lg border-2 transition-all ${selectedFormat === "single" ? "border-blue-500 bg-secondary" : "border-gray-200 hover:border-blue-300"}`}>
                                    <div className='flex justify-between items-start mb-2'>
                                        <h3 className='font-semibold'>Single File</h3>
                                        {recommendedFormat === "single" && <span className='text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded'>Recommended</span>}
                                    </div>
                                    <p className='text-sm text-muted-foreground'>All content in one file. Best for smaller contexts.</p>
                                    <div className='text-xs text-muted-foreground mt-2'>{getEstimations().single}</div>
                                </button>

                                <button onClick={() => setSelectedFormat("multi")} className={`p-4 rounded-lg border-2 transition-all ${selectedFormat === "multi" ? "border-blue-500 bg-secondary" : "border-gray-200 hover:border-blue-300"}`}>
                                    <div className='flex justify-between items-start mb-2'>
                                        <h3 className='font-semibold'>Multiple Files</h3>
                                        {recommendedFormat === "multi" && <span className='text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded'>Recommended</span>}
                                    </div>
                                    <p className='text-sm text-muted-foreground'>Split into optimal chunks. Better for large contexts.</p>
                                    <div className='text-xs text-muted-foreground mt-2'>{getEstimations().multiple}</div>
                                </button>
                            </div>

                            {selectedFormat === "multi" && <OutputSettings maxFileSize={maxFileSize} setMaxFileSize={setMaxFileSize} disabled={isProcessing} />}
                            <button onClick={generateOutput} disabled={!selectedFormat || isProcessing} className='w-full justify-center mt-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2'>
                                <Download className='w-4 h-4' />
                                Download
                            </button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default App;
