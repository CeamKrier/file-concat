import React, { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Download, Shield, Trash2, PlusIcon, XIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { FileEntry, FileStatus, OutputFormat, ProcessingConfig } from "./types";
import { validateFile, formatSize, estimateTokenCount, fetchRepositoryFiles } from "./utils";
import { LLM_CONTEXT_LIMITS, MULTI_OUTPUT_CHUNK_SIZE, MULTI_OUTPUT_LIMIT, DEFAULT_CONFIG } from "./constants";
import RepositoryInput from "./components/repository-input";
import { ThemeToggle } from "./components/theme-toggle";

const App: React.FC = () => {
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [output, setOutput] = useState<string>("");
    const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [isTableExpanded, setIsTableExpanded] = useState<boolean>(true);
    const dragCounter = useRef<number>(0);
    const [tokens, setTokens] = useState<number>(0);
    const [processedContents, setProcessedContents] = useState<Array<{ path: string; content: string }>>([]);
    const [recommendedFormat, setRecommendedFormat] = useState<OutputFormat>("single");
    const [selectedFormat, setSelectedFormat] = useState<OutputFormat | undefined>();
    const [config] = useState<ProcessingConfig>(DEFAULT_CONFIG);

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
            // Update the file status
            setFileStatuses(current => current.map((status, i) => (i === index ? { ...status, included: !status.included, forceInclude: !status.included } : status)));

            setIsProcessing(true);
            try {
                // Get all files that should be included
                const includedFiles = files.filter(
                    (_, i) =>
                        i === index
                            ? !fileStatuses[i].included // Toggle the current file
                            : fileStatuses[i].included // Keep existing status for others
                );

                // Process the files
                const contents = await Promise.all(
                    includedFiles.map(async ({ file, path }) => ({
                        path,
                        content: await file.text()
                    }))
                );

                // Update token count
                const tokenCount = await estimateTokenCount(contents.map(c => c.content).join("\n"));

                // Update state
                setProcessedContents(contents);
                setTokens(tokenCount);
            } catch (error) {
                console.error("Error reprocessing files:", error);
            } finally {
                setIsProcessing(false);
            }
        },
        [files, fileStatuses]
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
    }, [selectedFormat, processedContents]);

    const calculateChunks = (contents: Array<{ path: string; content: string }>) => {
        const targetCharSize = MULTI_OUTPUT_CHUNK_SIZE * 4;
        const chunks: (typeof contents)[] = [];
        let currentChunk: typeof contents = [];
        let currentSize = 0;

        for (const file of contents) {
            const fileSize = file.content.length;

            if (currentSize + fileSize > targetCharSize && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [];
                currentSize = 0;
            }

            currentChunk.push(file);
            currentSize += fileSize;
        }

        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        return chunks;
    };

    const resetAll = useCallback(() => {
        setFiles([]);
        setOutput("");
        setFileStatuses([]);
        setIsProcessing(false);
        setTokens(0);
        setProcessedContents([]);
        setSelectedFormat(undefined);
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
                                fileEntries.push({ file, path: fullPath });
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
                        path,
                        content: await file.text()
                    }))
                );

                // Estimate token count
                const tokenCount = await estimateTokenCount(contents.map(c => c.content).join("\n"));

                // Store processed contents in state for later use
                setProcessedContents(contents);

                // Store token count
                setTokens(tokenCount);
            } catch (error) {
                console.error("Error processing files:", error);
            } finally {
                setIsProcessing(false);
            }
        },
        [resetAll, processFile]
    );

    const handleRepositorySubmit = useCallback(
        async (url: string) => {
            setIsProcessing(true);
            try {
                const { files, error } = await fetchRepositoryFiles(url);

                if (error) {
                    throw new Error(error);
                }

                const fileEntries: FileEntry[] = [];
                const statuses: FileStatus[] = [];

                // Process each file from the repository
                for (const file of files) {
                    const blob = new Blob([file.content || ""], { type: "text/plain" });
                    const fileObj = new File([blob], file.name, { type: "text/plain" });

                    const status = await processFile(fileObj, file.path);

                    if (status.included) {
                        fileEntries.push({ file: fileObj, path: file.path });
                    }
                    statuses.push(status);
                }

                setFiles(fileEntries);
                setFileStatuses(statuses);

                // Process contents
                const contents = await Promise.all(
                    fileEntries.map(async ({ file, path }) => ({
                        path,
                        content: await file.text()
                    }))
                );

                // Estimate token count
                const tokenCount = await estimateTokenCount(contents.map(c => c.content).join("\n"));

                setProcessedContents(contents);
                setTokens(tokenCount);
            } catch (error) {
                console.error("Error fetching repository:", error);
                // You might want to show this error to the user
            } finally {
                setIsProcessing(false);
            }
        },
        [processFile]
    );

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
                                Combine multiple files and folders into a single, well-formatted document optimized for Large Language Models (LLMs). Perfect for sharing codebases, documentation, and project structures with AI assistants like ChatGPT or Claude.
                            </CardDescription>
                        </div>
                        <ThemeToggle />
                        <div className='flex flex-col gap-2'>
                            <div className='flex items-center gap-2 text-sm text-green-600 bg-muted px-3 py-1.5 rounded-md border border-green-200'>
                                <Shield className='w-4 h-4 fill-current' />
                                100% Offline Processing
                            </div>
                            <div className='flex items-center justify-center gap-2'>
                                <span className='text-sm text-muted-foreground'>Got feedback?</span>
                                <Button variant='ghost' asChild className='w-fit' size='sm'>
                                    <a className='w-fit' href='https://twitter.com/messages/compose?recipient_id=378117341' target='_blank'>
                                        <img height='12' width='12' src='https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/x.svg' />
                                    </a>
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <RepositoryInput isLoading={isProcessing} onSubmit={handleRepositorySubmit} />

                    <div className='flex items-center justify-center py-4'>or</div>

                    <div
                        onDragEnter={isProcessing ? undefined : handleDragEnter}
                        onDragLeave={isProcessing ? undefined : handleDragLeave}
                        onDragOver={isProcessing ? undefined : handleDragOver}
                        onDrop={isProcessing ? undefined : handleDrop}
                        className={`
        border-2 border-dashed rounded-lg p-8 text-center mb-4 
        transition-all duration-200
        ${isProcessing ? "opacity-50 cursor-not-allowed border-gray-200" : isDragging ? "border-blue-500 bg-blue-50" : "hover:border-blue-300"}
    `}>
                        <Upload
                            className={`w-12 h-12 mx-auto mb-4 transition-colors duration-200 
            ${isProcessing ? "text-gray-300" : isDragging ? "text-blue-500" : "text-gray-400"}`}
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
                                <div className='border rounded-lg max-h-[300px] overflow-auto'>
                                    <Table>
                                        <TableHeader className='sticky top-0 bg-background shadow-sm z-10'>
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
                                                        <Button variant='outline' size='sm' onClick={() => toggleFileInclusion(index)} disabled={isProcessing}>
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
                                <button onClick={() => setSelectedFormat("single")} className={`p-4 rounded-lg border-2 transition-all ${selectedFormat === "single" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-300"}`}>
                                    <div className='flex justify-between items-start mb-2'>
                                        <h3 className='font-semibold'>Single File</h3>
                                        {recommendedFormat === "single" && <span className='text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded'>Recommended</span>}
                                    </div>
                                    <p className='text-sm text-muted-foreground'>All content in one file. Best for smaller contexts.</p>
                                    <div className='text-xs text-muted-foreground mt-2'>~{formatSize(fileStatuses.filter(f => f.included).reduce((acc, { size }) => acc + size, 0))}</div>
                                </button>

                                <button onClick={() => setSelectedFormat("multi")} className={`p-4 rounded-lg border-2 transition-all ${selectedFormat === "multi" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-300"}`}>
                                    <div className='flex justify-between items-start mb-2'>
                                        <h3 className='font-semibold'>Multiple Files</h3>
                                        {recommendedFormat === "multi" && <span className='text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded'>Recommended</span>}
                                    </div>
                                    <p className='text-sm text-muted-foreground'>Split into optimal chunks. Better for large contexts.</p>
                                    <div className='text-xs text-muted-foreground mt-2'>
                                        {calculateChunks(processedContents).length} files, ~{formatSize(Math.ceil(fileStatuses.filter(f => f.included).reduce((acc, { size }) => acc + size, 0) / calculateChunks(processedContents).length))} each
                                    </div>
                                </button>
                            </div>
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
