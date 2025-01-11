import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const TokenInfoPopover = () => {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant='ghost' size='icon' className='h-4 w-4'>
                    <Info className='h-4 w-4' />
                    <span className='sr-only'>Token estimation info</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className='w-80'>
                <div className='space-y-2'>
                    <h4 className='font-medium'>About Token Estimation</h4>
                    <p className='text-sm text-muted-foreground'>Token counts are estimated using tiktoken, the same tokenizer used by OpenAI models. Estimations include:</p>
                    <ul className='text-sm text-muted-foreground list-disc pl-4 space-y-1'>
                        <li>Markdown formatting</li>
                        <li>Code syntax</li>
                        <li>Special characters</li>
                        <li>Whitespace and line breaks</li>
                    </ul>
                    <p className='text-sm text-muted-foreground mt-2'>Actual token usage may vary slightly depending on the model and how the content is processed.</p>
                </div>
            </PopoverContent>
        </Popover>
    );
};

export default TokenInfoPopover;
