import React, { useState } from "react";
import { SiGithub, SiGitlab } from "@icons-pack/react-simple-icons";
import { Loader2 } from "lucide-react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface RepositoryInputProps {
    onSubmit: (url: string) => Promise<void>;
    isLoading: boolean;
}

const RepositoryInput: React.FC<RepositoryInputProps> = ({ onSubmit, isLoading }) => {
    const [url, setUrl] = useState("");
    const [error, setError] = useState<string | null>(null);

    const validateUrl = (url: string): boolean => {
        // Basic validation for GitHub and GitLab URLs
        const githubRegex = /^https?:\/\/github\.com\/[\w-]+\/[\w.-]+$/;
        const gitlabRegex = /^https?:\/\/gitlab\.com\/[\w-]+\/[\w.-]+$/;

        return githubRegex.test(url) || gitlabRegex.test(url);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!validateUrl(url)) {
            setError("Please enter a valid GitHub or GitLab repository URL");
            return;
        }

        try {
            await onSubmit(url);
        } catch (error) {
            setError(error instanceof Error ? error.message : "Failed to fetch repository");
        }
    };

    return (
        <div className='space-y-4 p-4 border rounded-lg'>
            <div className='flex items-center gap-2'>
                <SiGithub className='w-5 h-5' />
                <SiGitlab className='w-5 h-5' />
                <Label>Public Repository URL</Label>
            </div>

            <form onSubmit={handleSubmit} className='flex gap-2'>
                <Input type='url' placeholder='https://github.com/username/repository' value={url} onChange={e => setUrl(e.target.value)} className='flex-1' disabled={isLoading} />
                <Button type='submit' disabled={isLoading || !url}>
                    {isLoading ? (
                        <>
                            <Loader2 className='w-4 h-4 animate-spin' />
                            Fetching...
                        </>
                    ) : (
                        "Fetch Files"
                    )}
                </Button>
            </form>

            {error && <p className='text-sm text-red-500'>{error}</p>}
        </div>
    );
};

export default RepositoryInput;
