import { SUPPORTED_EXTENSIONS } from "./constants";

export const isFileSupported = (filename: string): boolean => {
    if (!filename.includes(".")) return true;
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    return SUPPORTED_EXTENSIONS.has(ext);
};

export const getFileType = (filename: string): string => {
    if (!filename.includes(".")) return "Configuration File";
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    return ext.toUpperCase();
};

export const formatSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};
