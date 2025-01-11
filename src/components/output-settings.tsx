import React from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface OutputSettingsProps {
    maxFileSize: number;
    setMaxFileSize: (value: number) => void;
    disabled?: boolean;
}

const QUICK_SIZES = [
    { label: "128KB", value: 128 },
    { label: "512KB", value: 512 },
    { label: "1MB", value: 1024 },
    { label: "5MB", value: 5 * 1024 },
    { label: "10MB", value: 10 * 1024 },
    { label: "20MB", value: 20 * 1024 },
    { label: "30MB", value: 30 * 1024 }
];

const OutputSettings: React.FC<OutputSettingsProps> = ({ maxFileSize, setMaxFileSize, disabled = false }) => {
    const handleMaxFileSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value);
        if (!isNaN(value) && value >= 1) {
            setMaxFileSize(value);
        }
    };

    const adjustMaxFileSize = (increment: boolean) => {
        if (increment) {
            setMaxFileSize(maxFileSize + 32);
        } else {
            setMaxFileSize(Math.max(maxFileSize - 32, 32));
        }
    };

    return (
        <div className='space-y-4 mt-4'>
            <div className='flex items-center justify-between gap-12'>
                <div className='space-y-2 flex-1'>
                    <Label>Max Size Per File (KB)</Label>
                    <div className='flex flex-wrap gap-2 flex-1'>
                        {QUICK_SIZES.map(size => (
                            <Button key={size.value} variant={maxFileSize === size.value ? "secondary" : "outline"} size='sm' onClick={() => setMaxFileSize(size.value)} disabled={disabled} className='px-3 py-1 h-7 text-sm flex-1'>
                                {size.label}
                            </Button>
                        ))}
                    </div>
                    <div className='flex items-center gap-2'>
                        <Button variant='outline' size='icon' onClick={() => adjustMaxFileSize(false)} disabled={disabled || maxFileSize <= 32}>
                            <Minus className='h-4 w-4' />
                        </Button>
                        <Input type='number' min={32} step={32} value={maxFileSize} onChange={handleMaxFileSizeChange} className='w-full text-center' disabled={disabled} />
                        <Button variant='outline' size='icon' onClick={() => adjustMaxFileSize(true)} disabled={disabled}>
                            <Plus className='h-4 w-4' />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OutputSettings;
