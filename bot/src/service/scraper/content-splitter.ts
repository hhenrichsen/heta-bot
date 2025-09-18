import { Service } from 'typedi';
import Logger from 'bunyan';
import { ThreadChannel, EmbedBuilder } from 'discord.js';

export interface ContentChunk {
    type: 'image' | 'code' | 'paragraph' | 'sentence' | 'chunk';
    content: string;
    language?: string; // For code blocks
    metadata?: {
        originalIndex?: number;
        totalChunks?: number;
    };
}

@Service()
export class ContentSplitter {
    private readonly MAX_CHUNK_SIZE = 2000;
    private readonly MAX_CODE_BLOCK_SIZE = 1900; // Leave room for markdown formatting

    constructor(private readonly logger: Logger) {}

    /**
     * Split content into chunks and send them to a thread
     */
    public async splitAndSendContent(
        content: string,
        thread: ThreadChannel,
        suppressEmbeds: boolean = true,
        sourceUrl?: string,
    ): Promise<void> {
        try {
            this.logger.debug('Starting content splitting and sending process');

            // If content is small enough, send it as-is
            if (content.length <= this.MAX_CHUNK_SIZE) {
                await this.sendSingleMessage(content, thread, suppressEmbeds);
                this.logger.debug('Sent content as single message');
                return;
            }

            // Split content intelligently
            const chunks = this.intelligentSplit(content, sourceUrl);

            // Send chunks to thread
            await this.sendChunksToThread(chunks, thread, suppressEmbeds);

            this.logger.debug(
                `Successfully sent ${chunks.length} content chunks to thread`,
            );
        } catch (error) {
            this.logger.error('Error splitting and sending content:', error);
            throw error;
        }
    }

    /**
     * Split content into chunks without sending (for testing and other uses)
     */
    public splitContent(content: string, sourceUrl?: string): ContentChunk[] {
        // Always do intelligent splitting to handle images and URLs
        // even if content is small
        return this.intelligentSplit(content, sourceUrl);
    }

    /**
     * Intelligently split content based on structure and size
     */
    private intelligentSplit(
        content: string,
        sourceUrl?: string,
    ): ContentChunk[] {
        // First, resolve relative links to absolute links
        const contentWithAbsoluteLinks = this.resolveRelativeLinks(
            content,
            sourceUrl,
        );

        // Clean content before splitting to avoid issues with transformed content
        const cleanedContent = this.cleanContentForDiscord(
            contentWithAbsoluteLinks,
        );

        // Phase 1: Split into smallest logical units
        const atomicChunks = this.splitIntoAtomicChunks(cleanedContent);

        // Phase 2: Optimally recombine using dynamic programming
        const finalChunks = this.optimalRecombine(atomicChunks);

        return finalChunks;
    }

    /**
     * Resolve relative links to absolute links
     */
    private resolveRelativeLinks(content: string, sourceUrl?: string): string {
        if (!sourceUrl) {
            return content;
        }

        try {
            const baseUrl = new URL(sourceUrl);

            // Match markdown links [text](url)
            return content.replace(
                /\[([^\]]+)\]\(([^)]+)\)/g,
                (match, text, url) => {
                    try {
                        const resolvedUrl = this.resolveUrl(url, baseUrl);
                        return `[${text}](${resolvedUrl})`;
                    } catch (error) {
                        this.logger.warn(
                            `Failed to resolve URL: ${url}`,
                            error,
                        );
                        return match; // Return original if resolution fails
                    }
                },
            );
        } catch (error) {
            this.logger.warn(`Failed to parse source URL: ${sourceUrl}`, error);
            return content; // Return original content if source URL is invalid
        }
    }

    /**
     * Resolve a relative URL against a base URL
     */
    private resolveUrl(url: string, baseUrl: URL): string {
        // If URL is already absolute, return as-is
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }

        // If URL starts with //, it's protocol-relative, add the protocol
        if (url.startsWith('//')) {
            return `${baseUrl.protocol}${url}`;
        }

        // If URL starts with /, it's root-relative
        if (url.startsWith('/')) {
            return `${baseUrl.protocol}//${baseUrl.host}${url}`;
        }

        // If URL starts with #, it's a fragment (anchor link)
        if (url.startsWith('#')) {
            return `${baseUrl.href}${url}`;
        }

        // If URL starts with ?, it's a query string
        if (url.startsWith('?')) {
            return `${baseUrl.href}${url}`;
        }

        // For relative URLs (./, ../, or no prefix), resolve against the base path
        const basePath = baseUrl.pathname.endsWith('/')
            ? baseUrl.pathname
            : baseUrl.pathname.substring(
                  0,
                  baseUrl.pathname.lastIndexOf('/') + 1,
              );

        const resolvedPath = this.resolveRelativePath(basePath, url);
        return `${baseUrl.protocol}//${baseUrl.host}${resolvedPath}`;
    }

    /**
     * Resolve a relative path against a base path
     */
    private resolveRelativePath(
        basePath: string,
        relativePath: string,
    ): string {
        // Remove leading ./ if present
        if (relativePath.startsWith('./')) {
            relativePath = relativePath.substring(2);
        }

        // Handle ../ (parent directory) navigation
        const baseParts = basePath.split('/').filter((part) => part !== '');
        const relativeParts = relativePath.split('/');

        for (const part of relativeParts) {
            if (part === '..') {
                baseParts.pop();
            } else if (part !== '' && part !== '.') {
                baseParts.push(part);
            }
        }

        return '/' + baseParts.join('/');
    }

    /**
     * Split a large chunk using the most appropriate method
     */
    private splitLargeChunk(chunk: ContentChunk): ContentChunk[] {
        // Try horizontal rules first (most natural break)
        const horizontalRuleChunks = this.trySplitByHorizontalRules(chunk);
        if (horizontalRuleChunks.length > 1) {
            return horizontalRuleChunks;
        }

        // Try paragraphs if still too large
        const paragraphChunks = this.trySplitByParagraphs(chunk);
        if (paragraphChunks.length > 1) {
            return paragraphChunks;
        }

        // Only split code blocks if they're actually too large
        if (
            chunk.type === 'code' &&
            chunk.content.length > this.MAX_CODE_BLOCK_SIZE
        ) {
            return this.splitLargeCodeBlock(chunk);
        }

        // Only try sentences if the chunk is still too large after paragraph attempts
        if (chunk.content.length > this.MAX_CHUNK_SIZE) {
            const sentenceChunks = this.trySplitBySentences(chunk);
            if (sentenceChunks.length > 1) {
                return sentenceChunks;
            }
        }

        // Final fallback: character-based splitting
        return this.splitByCharacterCount(chunk);
    }

    /**
     * Try to split by horizontal rules, return original if no rules found
     */
    private trySplitByHorizontalRules(chunk: ContentChunk): ContentChunk[] {
        const horizontalRuleRegex = /^[-*_](?:\s*[-*_]){2,}$/gm;
        const parts = chunk.content.split(horizontalRuleRegex);

        if (parts.length <= 1) {
            return [chunk]; // No horizontal rules found
        }

        const result: ContentChunk[] = [];
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (part) {
                result.push({
                    type: 'paragraph',
                    content: part,
                });
            }
            // Add horizontal rule as separator (except for the last part)
            if (i < parts.length - 1) {
                result.push({
                    type: 'paragraph',
                    content:
                        '~~                                                 ~~',
                });
            }
        }

        return result;
    }

    /**
     * Phase 1: Split content into smallest logical atomic units
     */
    private splitIntoAtomicChunks(content: string): ContentChunk[] {
        const chunks: ContentChunk[] = [];

        // First split on images to separate them
        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        let lastIndex = 0;
        let match;

        while ((match = imageRegex.exec(content)) !== null) {
            // Add content before the image
            if (match.index > lastIndex) {
                const beforeImage = content
                    .slice(lastIndex, match.index)
                    .trim();
                if (beforeImage) {
                    chunks.push(...this.splitTextIntoAtomicChunks(beforeImage));
                }
            }

            // Add the image as atomic chunk
            chunks.push({
                type: 'image',
                content: match[0],
            });

            lastIndex = match.index + match[0].length;
        }

        // Add remaining content after the last image
        if (lastIndex < content.length) {
            const remaining = content.slice(lastIndex).trim();
            if (remaining) {
                chunks.push(...this.splitTextIntoAtomicChunks(remaining));
            }
        }

        return chunks;
    }

    /**
     * Split text content into atomic chunks (code blocks and paragraphs)
     */
    private splitTextIntoAtomicChunks(text: string): ContentChunk[] {
        const chunks: ContentChunk[] = [];
        const lines = text.split('\n');
        let currentChunk = '';
        let inCodeBlock = false;
        let codeBlockLanguage = '';

        for (const line of lines) {
            if (line.trim().startsWith('```')) {
                if (inCodeBlock) {
                    // End of code block
                    currentChunk += line + '\n';
                    chunks.push(
                        ...this.ensureAtomicChunkSize({
                            type: 'code',
                            content: currentChunk.trim(),
                            language: codeBlockLanguage,
                        }),
                    );
                    currentChunk = '';
                    inCodeBlock = false;
                    codeBlockLanguage = '';
                } else {
                    // Flush any existing text as paragraph
                    if (currentChunk.trim()) {
                        chunks.push(
                            ...this.ensureAtomicChunkSize({
                                type: 'paragraph',
                                content: currentChunk.trim(),
                            }),
                        );
                        currentChunk = '';
                    }
                    // Start of code block
                    inCodeBlock = true;
                    codeBlockLanguage = line.trim().substring(3);
                    currentChunk = line + '\n';
                }
            } else {
                currentChunk += line + '\n';

                // If not in code block and we hit a paragraph break, consider splitting
                if (!inCodeBlock && line.trim() === '' && currentChunk.trim()) {
                    // Only split on major structural elements, not every paragraph
                    const trimmedChunk = currentChunk.trim();
                    if (
                        trimmedChunk &&
                        this.isMajorStructuralBreak(trimmedChunk)
                    ) {
                        chunks.push(
                            ...this.ensureAtomicChunkSize({
                                type: 'paragraph',
                                content: trimmedChunk,
                            }),
                        );
                        currentChunk = '';
                    }
                }
            }
        }

        // Add any remaining content
        if (currentChunk.trim()) {
            chunks.push(
                ...this.ensureAtomicChunkSize({
                    type: inCodeBlock ? 'code' : 'paragraph',
                    content: currentChunk.trim(),
                    language: inCodeBlock ? codeBlockLanguage : undefined,
                }),
            );
        }

        return chunks;
    }

    /**
     * Check if content represents a major structural break (headers only)
     */
    private isMajorStructuralBreak(content: string): boolean {
        const lines = content.trim().split('\n');
        const lastLine = lines[lines.length - 1].trim();

        // Only split on headers - these are major section breaks
        return /^#{1,6}\s/.test(lastLine);
    }

    /**
     * Ensure atomic chunk fits in size, split if necessary
     */
    private ensureAtomicChunkSize(chunk: ContentChunk): ContentChunk[] {
        if (chunk.content.length <= this.MAX_CHUNK_SIZE) {
            return [chunk];
        }

        // If it's a code block, split by lines but preserve language
        if (chunk.type === 'code') {
            return this.splitLargeCodeBlock(chunk);
        }

        // For paragraphs, try sentence splitting then character splitting
        const sentenceChunks = this.trySplitBySentences(chunk);
        if (
            sentenceChunks.length > 1 &&
            sentenceChunks.every((c) => c.content.length <= this.MAX_CHUNK_SIZE)
        ) {
            return sentenceChunks;
        }

        // Fall back to character splitting
        return this.splitByCharacterCount(chunk);
    }

    /**
     * Phase 2: Optimally recombine atomic chunks using dynamic programming
     */
    private optimalRecombine(atomicChunks: ContentChunk[]): ContentChunk[] {
        if (atomicChunks.length === 0) return [];

        const n = atomicChunks.length;
        const result: ContentChunk[] = [];
        let i = 0;

        while (i < n) {
            if (atomicChunks[i].type === 'image') {
                // Images are always separate chunks
                result.push(atomicChunks[i]);
                i++;
            } else {
                // Find the optimal grouping of text chunks
                const optimalGroup = this.findOptimalTextGroup(atomicChunks, i);
                result.push(optimalGroup.chunk);
                i = optimalGroup.endIndex;
            }
        }

        return result;
    }

    /**
     * Find optimal grouping of consecutive text chunks starting at index
     */
    private findOptimalTextGroup(
        chunks: ContentChunk[],
        startIndex: number,
    ): { chunk: ContentChunk; endIndex: number } {
        let bestGroup = chunks[startIndex];
        let bestEndIndex = startIndex + 1;
        let currentContent = chunks[startIndex].content;

        // Try to extend the group as far as possible
        for (let i = startIndex + 1; i < chunks.length; i++) {
            const chunk = chunks[i];

            // Stop at images
            if (chunk.type === 'image') break;

            const testContent = currentContent + '\n\n' + chunk.content;

            // If combining would exceed limit, stop
            if (testContent.length > this.MAX_CHUNK_SIZE) break;

            // Also check that code blocks remain intact
            if (!this.hasMatchedCodeBlocks(testContent)) break;

            // Update best group
            currentContent = testContent;
            bestGroup = {
                type: 'paragraph',
                content: currentContent.trim(),
            };
            bestEndIndex = i + 1;
        }

        return { chunk: bestGroup, endIndex: bestEndIndex };
    }

    /**
     * Check if content has properly matched code block fences
     */
    private hasMatchedCodeBlocks(content: string): boolean {
        const fences = content.match(/```/g);
        return !fences || fences.length % 2 === 0;
    }

    /**
     * Try to split by paragraphs, return original if no good breaks found
     */
    private trySplitByParagraphs(chunk: ContentChunk): ContentChunk[] {
        const paragraphs = this.splitMarkdownParagraphs(chunk.content);

        // Only split if we have multiple paragraphs and the first one is reasonably sized
        if (paragraphs.length <= 1) {
            return [chunk];
        }

        const result: ContentChunk[] = [];
        let currentChunk = '';

        for (const paragraph of paragraphs) {
            const trimmedParagraph = paragraph.trim();
            if (!trimmedParagraph) continue;

            const testChunk =
                currentChunk + (currentChunk ? '\n\n' : '') + trimmedParagraph;

            if (testChunk.length <= this.MAX_CHUNK_SIZE) {
                currentChunk = testChunk;
            } else {
                // Save current chunk and start new one
                if (currentChunk) {
                    result.push({
                        type: 'paragraph',
                        content: currentChunk,
                    });
                }

                // Check if the new paragraph itself is too large
                if (trimmedParagraph.length > this.MAX_CHUNK_SIZE) {
                    // Split this large paragraph further
                    const subChunks = this.splitByCharacterCount({
                        type: 'paragraph',
                        content: trimmedParagraph,
                    });
                    result.push(...subChunks);
                    currentChunk = '';
                } else {
                    currentChunk = trimmedParagraph;
                }
            }
        }

        // Add the last chunk
        if (currentChunk) {
            if (currentChunk.length > this.MAX_CHUNK_SIZE) {
                // Split this large final chunk
                const subChunks = this.splitByCharacterCount({
                    type: 'paragraph',
                    content: currentChunk,
                });
                result.push(...subChunks);
            } else {
                result.push({
                    type: 'paragraph',
                    content: currentChunk,
                });
            }
        }

        // Validate that all resulting chunks have matched code blocks
        const validResult = result.filter((chunk) =>
            this.hasMatchedCodeBlocks(chunk.content),
        );

        // If any chunks would break code blocks, return original chunk instead
        if (validResult.length !== result.length) {
            return [chunk];
        }

        // Always return result if we have any chunks (even if just 1)
        // The only time we return [chunk] is if we truly couldn't split
        return result.length > 0 ? result : [chunk];
    }

    /**
     * Split large code blocks into smaller chunks while preserving language
     */
    private splitLargeCodeBlock(chunk: ContentChunk): ContentChunk[] {
        if (chunk.type !== 'code') {
            return [chunk];
        }

        const chunks: ContentChunk[] = [];
        const lines = chunk.content.split('\n');
        let currentChunk = '';

        for (const line of lines) {
            const testChunk = currentChunk + (currentChunk ? '\n' : '') + line;

            if (testChunk.length > this.MAX_CODE_BLOCK_SIZE && currentChunk) {
                // Save current chunk and start new one
                chunks.push({
                    type: 'code',
                    content: currentChunk,
                    language: chunk.language || '',
                });
                currentChunk = line;
            } else {
                currentChunk = testChunk;
            }
        }

        // Add the last chunk
        if (currentChunk) {
            chunks.push({
                type: 'code',
                content: currentChunk,
                language: chunk.language || '',
            });
        }

        return chunks;
    }

    /**
     * Try to split by sentences, return original if no good breaks found
     */
    private trySplitBySentences(chunk: ContentChunk): ContentChunk[] {
        const sentences = this.splitTextBySentences(chunk.content);

        if (sentences.length <= 1) {
            return [chunk];
        }

        const result: ContentChunk[] = [];
        let currentChunk = '';

        for (const sentence of sentences) {
            const testChunk =
                currentChunk + (currentChunk ? ' ' : '') + sentence;

            if (testChunk.length <= this.MAX_CHUNK_SIZE) {
                currentChunk = testChunk;
            } else {
                // Save current chunk and start new one
                if (currentChunk) {
                    result.push({
                        type: 'paragraph',
                        content: currentChunk.trim(),
                    });
                }

                // Check if the sentence itself is too large
                if (sentence.length > this.MAX_CHUNK_SIZE) {
                    // Split this large sentence further
                    const subChunks = this.splitByCharacterCount({
                        type: 'paragraph',
                        content: sentence,
                    });
                    result.push(...subChunks);
                    currentChunk = '';
                } else {
                    currentChunk = sentence;
                }
            }
        }

        // Add the last chunk
        if (currentChunk) {
            if (currentChunk.length > this.MAX_CHUNK_SIZE) {
                // Split this large final chunk
                const subChunks = this.splitByCharacterCount({
                    type: 'paragraph',
                    content: currentChunk,
                });
                result.push(...subChunks);
            } else {
                result.push({
                    type: 'paragraph',
                    content: currentChunk.trim(),
                });
            }
        }

        // Validate that all resulting chunks have matched code blocks
        const validResult = result.filter((chunk) =>
            this.hasMatchedCodeBlocks(chunk.content),
        );

        // If any chunks would break code blocks, return original chunk instead
        if (validResult.length !== result.length) {
            return [chunk];
        }

        // Always return result if we have any chunks (even if just 1)
        return result.length > 0 ? result : [chunk];
    }

    /**
     * Split text into sentences
     */
    private splitTextBySentences(text: string): string[] {
        // Simple sentence splitting - look for sentence endings followed by space and capital letter
        const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
        return sentences.filter((sentence) => sentence.trim().length > 0);
    }

    /**
     * Final fallback: split by character count
     */
    private splitByCharacterCount(chunk: ContentChunk): ContentChunk[] {
        const chunks: ContentChunk[] = [];
        const maxSize = this.MAX_CHUNK_SIZE;
        let remaining = chunk.content;

        while (remaining.length > maxSize) {
            let breakPoint = maxSize;

            // Try to find a good break point (space, punctuation, etc.)
            for (let i = maxSize; i > maxSize * 0.7; i--) {
                const char = remaining[i];
                if (
                    char === ' ' ||
                    char === '\n' ||
                    char === '.' ||
                    char === '!'
                ) {
                    breakPoint = i;
                    break;
                }
            }

            const chunkContent = remaining.substring(0, breakPoint).trim();

            // Safety check: ensure chunk is not empty and not too large
            if (chunkContent.length > 0 && chunkContent.length <= maxSize) {
                chunks.push({
                    type: 'paragraph',
                    content: chunkContent,
                });
            } else if (chunkContent.length > maxSize) {
                // If even the break point is too large, force split at maxSize
                chunks.push({
                    type: 'paragraph',
                    content: remaining.substring(0, maxSize),
                });
            }

            remaining = remaining.substring(breakPoint).trim();
        }

        if (remaining && remaining.length > 0) {
            // Final safety check
            if (remaining.length <= maxSize) {
                chunks.push({
                    type: 'paragraph',
                    content: remaining,
                });
            } else {
                // If remaining is still too large, split it further
                const subChunks = this.splitByCharacterCount({
                    type: 'paragraph',
                    content: remaining,
                });
                chunks.push(...subChunks);
            }
        }

        return chunks;
    }

    /**
     * Send a single message to the thread
     */
    private async sendSingleMessage(
        content: string,
        thread: ThreadChannel,
        suppressEmbeds: boolean,
    ): Promise<void> {
        const cleanedContent = this.cleanContentForDiscord(content);
        const messageOptions: any = {
            content: cleanedContent,
        };

        if (suppressEmbeds) {
            messageOptions.flags = 4; // SUPPRESS_EMBEDS flag
        }

        await thread.send(messageOptions);
    }

    /**
     * Split markdown content into paragraphs while preserving structure
     */
    private splitMarkdownParagraphs(content: string): string[] {
        const paragraphs: string[] = [];
        const lines = content.split('\n');
        let currentParagraph: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Check if this is a structural element that should start a new paragraph
            if (this.isMarkdownStructuralElement(trimmedLine)) {
                // Save current paragraph if it has content
                if (currentParagraph.length > 0) {
                    paragraphs.push(currentParagraph.join('\n'));
                    currentParagraph = [];
                }
                // Add the structural element as its own paragraph
                paragraphs.push(line);
            } else if (trimmedLine === '') {
                // Empty line - end current paragraph
                if (currentParagraph.length > 0) {
                    paragraphs.push(currentParagraph.join('\n'));
                    currentParagraph = [];
                }
            } else {
                // Regular content line
                currentParagraph.push(line);
            }
        }

        // Add the last paragraph if it has content
        if (currentParagraph.length > 0) {
            paragraphs.push(currentParagraph.join('\n'));
        }

        return paragraphs;
    }

    /**
     * Check if a line is a markdown structural element
     */
    private isMarkdownStructuralElement(line: string): boolean {
        const trimmed = line.trim();

        // Headers
        if (/^#{1,6}\s/.test(trimmed)) return true;

        // Horizontal rules
        if (/^[-*_](?:\s*[-*_]){2,}$/.test(trimmed)) return true;

        // List items (but not when they're part of a code block)
        if (/^\s*[-*+]\s/.test(trimmed)) return true;
        if (/^\s*\d+\.\s/.test(trimmed)) return true;

        // Blockquotes
        if (/^\s*>/.test(trimmed)) return true;

        // Code blocks
        if (/^```/.test(trimmed)) return true;

        // Tables (basic detection)
        if (/\|.*\|/.test(trimmed)) return true;

        return false;
    }

    /**
     * Send chunks to thread with appropriate formatting
     */
    private async sendChunksToThread(
        chunks: ContentChunk[],
        thread: ThreadChannel,
        suppressEmbeds: boolean,
    ): Promise<void> {
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];

            try {
                if (chunk.type === 'image') {
                    // Send images as embeds for better visibility
                    await this.sendImageAsEmbed(chunk.content, thread);
                } else {
                    // Clean content for Discord and send as regular messages
                    const cleanedContent = this.cleanContentForDiscord(
                        chunk.content,
                    );

                    // Validate content length before sending
                    this.logger.debug(
                        `Chunk ${i + 1} length: ${cleanedContent.length} chars`,
                    );

                    if (cleanedContent.length > this.MAX_CHUNK_SIZE) {
                        this.logger.warn(
                            `Chunk ${i + 1} is too large (${cleanedContent.length} chars), splitting further`,
                        );
                        const subChunks = this.splitByCharacterCount({
                            type: 'paragraph',
                            content: cleanedContent,
                        });

                        // Send sub-chunks recursively
                        await this.sendChunksToThread(
                            subChunks,
                            thread,
                            suppressEmbeds,
                        );
                        continue;
                    }

                    const messageOptions: any = {
                        content: cleanedContent,
                    };

                    if (suppressEmbeds) {
                        messageOptions.flags = 4; // SUPPRESS_EMBEDS flag
                    }

                    await thread.send(messageOptions);
                }

                // Add a small delay to avoid rate limiting
                if (i < chunks.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            } catch (error) {
                this.logger.error(
                    `Error sending chunk ${i + 1}/${chunks.length}:`,
                    error,
                );

                // If it's a length error, try to split the chunk further
                if (
                    error instanceof Error &&
                    error.message.includes('Must be 2000 or fewer in length')
                ) {
                    this.logger.warn(
                        `Chunk ${i + 1} exceeded Discord's character limit, attempting to split further`,
                    );
                    const subChunks = this.splitByCharacterCount(chunk);
                    await this.sendChunksToThread(
                        subChunks,
                        thread,
                        suppressEmbeds,
                    );
                    continue;
                }

                // Continue with next chunk even if one fails
            }
        }
    }

    /**
     * Clean content for Discord display
     */
    private cleanContentForDiscord(content: string): string {
        let cleaned = content;

        // Remove YAML frontmatter
        cleaned = cleaned.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/m, '');

        cleaned = cleaned.replace(
            /^\* \* \*$/gm,
            '~~                                                 ~~',
        );

        // Clean up excessive whitespace
        cleaned = cleaned
            .replace(/\n{3,}/g, '\n\n') // Remove more than 2 consecutive newlines
            .replace(/[ \t]+$/gm, '') // Remove trailing whitespace
            .trim();

        return cleaned;
    }

    /**
     * Send an image as a Discord embed
     */
    private async sendImageAsEmbed(
        imageMarkdown: string,
        thread: ThreadChannel,
    ): Promise<void> {
        try {
            // Extract URL and alt text from markdown image syntax: ![alt](url)
            const imageMatch = imageMarkdown.match(
                /^!\[([^\]]*)\]\(([^)]+)\)$/,
            );
            if (!imageMatch) {
                // Fallback to sending as regular message if parsing fails
                await thread.send({ content: imageMarkdown });
                return;
            }

            const [, altText, imageUrl] = imageMatch;

            // Create an embed with the image
            const embed = new EmbedBuilder()
                .setImage(imageUrl)
                .setColor(0x0099ff); // Discord blue color

            // Add alt text as description if it exists and is meaningful
            if (altText && altText.trim() && altText.trim() !== '') {
                embed.setDescription(altText);
            }

            await thread.send({ embeds: [embed] });
        } catch (error) {
            this.logger.error('Error sending image as embed:', error);
            // Fallback to sending as regular message
            await thread.send({ content: imageMarkdown });
        }
    }
}
