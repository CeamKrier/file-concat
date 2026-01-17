import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: Array<{
    name: string;
    content: string;
  }>;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ isOpen, onClose, files }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[80vh] max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Output Preview</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={files[0]?.name}>
          <ScrollArea className="h-[50px] w-[752px]" type="always">
            <TabsList className="w-full justify-start">
              {files.map((file, index) => (
                <TabsTrigger key={file.name} value={file.name} className="min-w-[150px]">
                  {files.length > 1 ? `Part ${index + 1}` : "Output"}
                </TabsTrigger>
              ))}
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {files.map((file) => (
            <TabsContent key={file.name} value={file.name} className="mt-4 h-[calc(80vh-140px)]">
              <ScrollArea className="h-full rounded-md border p-4 font-mono text-sm" type="always">
                <pre
                  className="overflow-wrap-break-word whitespace-pre-wrap break-all font-mono text-sm"
                  style={{
                    wordBreak: "break-word",
                    overflowWrap: "break-word",
                    maxWidth: "100%",
                  }}
                >
                  {file.content}
                </pre>
                <ScrollBar orientation="vertical" />
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default PreviewModal;
