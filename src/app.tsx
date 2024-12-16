import React, { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Download, Shield, Trash2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { FileEntry, FileContent, FileStatus, ProcessingConfig } from "./types";
import { isFileSupported, getFileType, formatSize, estimateTokenCount } from "./utils";
import { LLM_CONTEXT_LIMITS } from "./constants";

const App: React.FC = () => {
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [output, setOutput] = useState<string>("");
    const [concatenationType, setConcatenationType] = useState<"single" | "multiple">("single");
    const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [isTableExpanded, setIsTableExpanded] = useState<boolean>(false);
    const dragCounter = useRef<number>(0);
    const [tokens, setTokens] = useState<number>(0);

    useEffect(() => {
        estimateTokenCount(output).then(count => {
            console.log("Token count:", count);
            setTokens(count);
        });
    }, [output]);

    const defaultConfig: ProcessingConfig = {
        maxFileSizeMB: 10,
        excludeHiddenFiles: true,
        excludeBinaryFiles: true
    };

    const validateFile = useCallback(
        (file: File, path: string): FileStatus => {
            const status: FileStatus = {
                path,
                included: true,
                size: file.size,
                type: getFileType(file.name)
            };

            if (!isFileSupported(file.name)) {
                status.included = false;
                status.reason = "Unsupported file type";
            } else if (file.size > defaultConfig.maxFileSizeMB * 1024 * 1024) {
                status.included = false;
                status.reason = `File size exceeds ${defaultConfig.maxFileSizeMB}MB limit`;
            } else if (defaultConfig.excludeHiddenFiles && file.name.startsWith(".")) {
                status.included = false;
                status.reason = "Hidden file";
            }

            return status;
        },
        [defaultConfig.excludeHiddenFiles, defaultConfig.maxFileSizeMB]
    );

    const processFiles = useCallback(async () => {
        if (files.length === 0) return;
        setIsProcessing(true);

        try {
            const contents = await Promise.all(
                files.map(async ({ file, path }) => {
                    const text = await file.text();
                    return {
                        path,
                        content: text
                    };
                })
            );

            // Create project structure overview
            const projectStructure = files.map(({ path }) => `- ${path}`).join("\n");

            if (concatenationType === "single") {
                const concatenated = `# Project Structure\nThe following files are included in this codebase:\n\n${projectStructure}\n\n# File Contents\n\n` + contents.map(({ path, content }) => `### File: ${path}\nLocation: ${path}\n\n\`\`\`\n${content}\n\`\`\`\n\n---\n\n`).join("");
                setOutput(concatenated);
            } else {
                const groupedByExt = contents.reduce((acc, { path, content }) => {
                    const ext = path.split(".").pop() || "no-extension";
                    if (!acc[ext]) acc[ext] = [];
                    acc[ext].push({ path, content });
                    return acc;
                }, {} as Record<string, FileContent[]>);

                const concatenated =
                    `# Project Structure\nThe following files are included in this codebase:\n\n${projectStructure}\n\n# File Contents By Type\n\n` +
                    Object.entries(groupedByExt)
                        .map(([ext, files]) => `## ${ext.toUpperCase()} Files\n\n` + files.map(({ path, content }) => `### File: ${path}\nLocation: ${path}\n\n\`\`\`\n${content}\n\`\`\`\n\n---\n\n`).join(""))
                        .join("\n\n");
                setOutput(concatenated);
            }
        } catch (error) {
            console.error("Error processing files:", error);
        } finally {
            setIsProcessing(false);
        }
    }, [files, concatenationType]);

    const downloadOutput = useCallback(() => {
        const blob = new Blob([output], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "concat-output.md";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [output]);

    const resetAll = useCallback(() => {
        setFiles([]);
        setOutput("");
        setFileStatuses([]);
        setIsProcessing(false);
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
                        fileEntry.file(file => {
                            const fullPath = path + file.name;
                            const status = validateFile(file, fullPath);

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
            } catch (error) {
                console.error("Error processing files:", error);
            } finally {
                setIsProcessing(false);
            }
        },
        [validateFile]
    );

    return (
        <div className='p-4 max-w-4xl mx-auto'>
            <Card>
                <CardHeader>
                    <div className='flex justify-between items-start'>
                        <div>
                            <CardTitle className='flex items-center gap-2 mb-2'>
                                <img src='/logo.png' alt='Logo' className='w-8 h-8' />
                                File Concat Tool
                            </CardTitle>
                            <CardDescription className='text-sm max-w-xl'>
                                Combine multiple files and folders into a single, well-formatted document optimized for Large Language Models (LLMs). Perfect for sharing codebases, documentation, and project structures with AI assistants like ChatGPT or Claude.
                            </CardDescription>
                        </div>
                        <div className='flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-md border border-green-200'>
                            <Shield className='w-4 h-4' />
                            100% Offline Processing
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Alert className='mb-4'>
                        <AlertDescription className='space-y-2'>
                            <p>Supported file types:</p>
                            <div className='grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm'>
                                <div>
                                    <strong>Code:</strong> .js, .py, .java, .cpp, .ts, .go, .rb, .php
                                </div>
                                <div>
                                    <strong>Web:</strong> .html, .css, .json, .xml, .yaml
                                </div>
                                <div>
                                    <strong>Docs:</strong> .md, .txt, .csv, .log
                                </div>
                                <div>
                                    <strong>Config:</strong> .env, .ini, .yml, .json
                                </div>
                                <div>
                                    <strong>Shell:</strong> .sh, .bash, .zsh, .ps1
                                </div>
                                <div>
                                    <strong>Other:</strong> No-extension config files
                                </div>
                            </div>
                            <p className='text-sm mt-4'>Files are processed locally in your browser. Maximum file size: 10MB per file.</p>
                        </AlertDescription>
                    </Alert>

                    <div
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        className={`
        border-2 border-dashed rounded-lg p-8 text-center mb-4 
        transition-all duration-200
        ${isDragging ? "border-blue-500 bg-blue-50" : "hover:border-blue-300"}
      `}>
                        <Upload
                            className={`w-12 h-12 mx-auto mb-4 transition-colors duration-200 
          ${isDragging ? "text-blue-500" : "text-gray-400"}`}
                        />
                        <p>{isDragging ? "Drop files here" : "Drag and drop files or folders here"}</p>
                        {files.length > 0 && (
                            <div className='mt-2 text-sm text-gray-500'>
                                <p>{files.length} files selected</p>
                                <p>Total size: {formatSize(files.reduce((acc, { file }) => acc + file.size, 0))}</p>
                            </div>
                        )}
                    </div>

                    {fileStatuses.length > 0 && (
                        <div className='mt-4 mb-4'>
                            <div className='flex justify-between items-center mb-4'>
                                <div className='space-y-1'>
                                    <h3 className='font-semibold'>File Processing Summary</h3>
                                    <p className='text-sm text-gray-500'>
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
                                        <TableHeader className='sticky top-0 bg-white shadow-sm z-10'>
                                            <TableRow>
                                                <TableHead>Status</TableHead>
                                                <TableHead>File</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Size</TableHead>
                                                <TableHead>Notes</TableHead>
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
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </div>
                    )}

                    <div className='flex gap-4 mb-4'>
                        <label className='flex items-center'>
                            <input type='radio' value='single' checked={concatenationType === "single"} onChange={e => setConcatenationType(e.target.value as "single" | "multiple")} className='mr-2' />
                            Single File Output
                        </label>
                        <label className='flex items-center'>
                            <input type='radio' value='multiple' checked={concatenationType === "multiple"} onChange={e => setConcatenationType(e.target.value as "single" | "multiple")} className='mr-2' />
                            Group by Extension
                        </label>
                    </div>

                    <div className='flex gap-4'>
                        <button onClick={processFiles} disabled={files.length === 0 || isProcessing} className='px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed'>
                            {isProcessing ? "Processing..." : "Process Files"}
                        </button>

                        {(files.length > 0 || output) && (
                            <button onClick={resetAll} className='px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2'>
                                <Trash2 className='w-4 h-4' />
                                Start Over
                            </button>
                        )}
                    </div>

                    {output && (
                        <div className='mt-4 space-y-4'>
                            <div className='flex items-center justify-between'>
                                <h3 className='font-semibold'>Preview:</h3>
                                <div className='flex items-center gap-4'>
                                    <div className='text-sm text-gray-600'>Estimated tokens: {tokens.toLocaleString()}</div>
                                </div>
                            </div>

                            {LLM_CONTEXT_LIMITS.map(llm => {
                                const percentage = (tokens / llm.limit) * 100;
                                return (
                                    <div key={llm.name} className='space-y-1'>
                                        <div className='flex justify-between text-sm'>
                                            <span>
                                                <span className='font-bold'>{llm.name}</span> - {llm.limit.toLocaleString()} tokens
                                            </span>
                                            <span className={percentage > 100 ? "text-red-500" : "text-gray-600"}>{percentage.toFixed(1)}% used</span>
                                        </div>
                                        <div className='w-full bg-gray-200 rounded-full h-2'>
                                            <div className={`h-2 rounded-full ${percentage > 90 ? "bg-red-500" : percentage > 70 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min(percentage, 100)}%` }} />
                                        </div>
                                    </div>
                                );
                            })}

                            <pre className='whitespace-pre-wrap bg-gray-100 p-4 rounded-lg max-h-96 overflow-y-auto'>{output}</pre>
                            <button onClick={downloadOutput} disabled={!output || isProcessing} className='mt-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2'>
                                <Download className='w-4 h-4' />
                                Download Result
                            </button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default App;
