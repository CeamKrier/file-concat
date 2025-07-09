import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const AboutSection: React.FC = () => {
    return (
        <div className='space-y-6 mt-8'>
            {/* How It Works Section */}
            <Card>
                <CardHeader>
                    <CardTitle className='text-xl'>🚀 How FileConcat Works</CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                    <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                        <div className='text-center p-4 border rounded-lg'>
                            <div className='text-3xl mb-2'>📁</div>
                            <h3 className='font-semibold mb-2'>1. Upload or Import</h3>
                            <p className='text-sm text-muted-foreground'>Drag & drop files/folders or import directly from GitHub repositories</p>
                        </div>
                        <div className='text-center p-4 border rounded-lg'>
                            <div className='text-3xl mb-2'>⚙️</div>
                            <h3 className='font-semibold mb-2'>2. Smart Processing</h3>
                            <p className='text-sm text-muted-foreground'>AI-optimized formatting with token counting and context awareness</p>
                        </div>
                        <div className='text-center p-4 border rounded-lg'>
                            <div className='text-3xl mb-2'>📤</div>
                            <h3 className='font-semibold mb-2'>3. Export & Share</h3>
                            <p className='text-sm text-muted-foreground'>Download optimized files ready for ChatGPT, Claude, or any LLM</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Use Cases */}
            <Card>
                <CardHeader>
                    <CardTitle className='text-xl'>💡 Popular Use Cases</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <div>
                            <h3 className='font-semibold mb-3 flex items-center gap-2'>👨‍💻 For Developers</h3>
                            <ul className='space-y-2 text-sm text-muted-foreground'>
                                <li>• Code review with AI assistants</li>
                                <li>• Sharing entire codebases for debugging</li>
                                <li>• Architecture analysis and optimization</li>
                                <li>• API documentation generation</li>
                                <li>• Legacy code modernization</li>
                            </ul>
                        </div>
                        <div>
                            <h3 className='font-semibold mb-3 flex items-center gap-2'>📚 For Content Creators</h3>
                            <ul className='space-y-2 text-sm text-muted-foreground'>
                                <li>• Combining blog posts for editing</li>
                                <li>• Documentation consolidation</li>
                                <li>• Research paper compilation</li>
                                <li>• Multi-file content analysis</li>
                                <li>• Style consistency checking</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Features Grid */}
            <Card>
                <CardHeader>
                    <CardTitle className='text-xl'>✨ Key Features</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                        <div className='flex items-start gap-3 p-3 border rounded-lg'>
                            <div className='text-xl'>🔒</div>
                            <div>
                                <h4 className='font-semibold text-sm'>100% Secure</h4>
                                <p className='text-xs text-muted-foreground'>All processing happens locally in your browser</p>
                            </div>
                        </div>
                        <div className='flex items-start gap-3 p-3 border rounded-lg'>
                            <div className='text-xl'>⚡</div>
                            <div>
                                <h4 className='font-semibold text-sm'>Lightning Fast</h4>
                                <p className='text-xs text-muted-foreground'>No uploads or downloads, instant processing</p>
                            </div>
                        </div>
                        <div className='flex items-start gap-3 p-3 border rounded-lg'>
                            <div className='text-xl'>📊</div>
                            <div>
                                <h4 className='font-semibold text-sm'>Token Counter</h4>
                                <p className='text-xs text-muted-foreground'>Real-time token estimation for different LLMs</p>
                            </div>
                        </div>
                        <div className='flex items-start gap-3 p-3 border rounded-lg'>
                            <div className='text-xl'>🌐</div>
                            <div>
                                <h4 className='font-semibold text-sm'>GitHub Integration</h4>
                                <p className='text-xs text-muted-foreground'>Import repositories directly from GitHub</p>
                            </div>
                        </div>
                        <div className='flex items-start gap-3 p-3 border rounded-lg'>
                            <div className='text-xl'>📱</div>
                            <div>
                                <h4 className='font-semibold text-sm'>Mobile Friendly</h4>
                                <p className='text-xs text-muted-foreground'>Works perfectly on all devices</p>
                            </div>
                        </div>
                        <div className='flex items-start gap-3 p-3 border rounded-lg'>
                            <div className='text-xl'>🎯</div>
                            <div>
                                <h4 className='font-semibold text-sm'>Smart Filtering</h4>
                                <p className='text-xs text-muted-foreground'>Automatically excludes binary and unnecessary files</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* FAQ Section */}
            <Card>
                <CardHeader>
                    <CardTitle className='text-xl'>❓ Frequently Asked Questions</CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                    <div>
                        <h4 className='font-semibold mb-2'>Is FileConcat completely free?</h4>
                        <p className='text-sm text-muted-foreground'>Yes! FileConcat is 100% free to use with no limits, no registration required, and no hidden fees.</p>
                    </div>
                    <div>
                        <h4 className='font-semibold mb-2'>How secure is my data?</h4>
                        <p className='text-sm text-muted-foreground'>Completely secure. All file processing happens locally in your browser. Your files never leave your device or get uploaded to any server.</p>
                    </div>
                    <div>
                        <h4 className='font-semibold mb-2'>What file types are supported?</h4>
                        <p className='text-sm text-muted-foreground'>We support all common code files (JS, TS, Python, Java, etc.), documentation (MD, TXT), configuration files (JSON, YAML), and many more.</p>
                    </div>
                    <div>
                        <h4 className='font-semibold mb-2'>Can I use this for large projects?</h4>
                        <p className='text-sm text-muted-foreground'>Absolutely! Our smart chunking system can handle large codebases by splitting them into appropriately sized files for different AI models.</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default AboutSection;
