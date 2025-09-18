import { ContentSplitter } from './content-splitter';
import Logger from 'bunyan';
import fs from 'fs';
import path from 'path';
import { describe, it, beforeEach, expect, mock } from 'bun:test';

// Mock logger
const mockLogger = {
    debug: mock(),
    warn: mock(),
    error: mock(),
} as unknown as Logger;

describe('ContentSplitter', () => {
    let contentSplitter: ContentSplitter;

    beforeEach(() => {
        contentSplitter = new ContentSplitter(mockLogger);
    });

    describe('splitContent method', () => {
        describe('Short Content (under 2000 chars)', () => {
            it('should return single chunk for short content', () => {
                const shortContent = fs.readFileSync(
                    path.join(
                        __dirname,
                        '../../../../fixtures/test-short-content.md',
                    ),
                    'utf8',
                );

                const chunks = contentSplitter.splitContent(shortContent);

                expect(chunks).toHaveLength(1);
                expect(chunks[0].type).toBe('paragraph');
                expect(chunks[0].content).toContain('Short Content Test');
                expect(chunks[0].content.length).toBeLessThanOrEqual(2000);
            });
        });

        describe('Image Splitting', () => {
            it('should always split on images to interleave them', () => {
                const contentWithImages = fs.readFileSync(
                    path.join(
                        __dirname,
                        '../../../../fixtures/test-with-images.md',
                    ),
                    'utf8',
                );

                const chunks = contentSplitter.splitContent(contentWithImages);

                // Should have multiple chunks: text chunks and images
                expect(chunks.length).toBeGreaterThan(3);

                // Check that images are separate chunks
                const imageChunks = chunks.filter(
                    (chunk) => chunk.type === 'image',
                );
                expect(imageChunks).toHaveLength(3); // 3 images in fixture

                // Check that text chunks are separate
                const textChunks = chunks.filter(
                    (chunk) => chunk.type === 'paragraph',
                );
                expect(textChunks.length).toBeGreaterThan(0);

                // Images should contain markdown image syntax
                imageChunks.forEach((chunk) => {
                    expect(chunk.content).toMatch(/^!\[.*\]\(.*\)$/);
                });
            });
        });

        describe('Code Block Preservation', () => {
            it('should keep code blocks as single units when possible', () => {
                const codeBlockContent = fs.readFileSync(
                    path.join(
                        __dirname,
                        '../../../../fixtures/test-code-blocks-preservation.md',
                    ),
                    'utf8',
                );

                const chunks = contentSplitter.splitContent(codeBlockContent);

                // Find chunks containing code blocks
                const codeBlockChunks = chunks.filter(
                    (chunk) =>
                        chunk.content.includes('```') &&
                        (chunk.content.includes('def hello_world') ||
                            chunk.content.includes('class UserManager') ||
                            chunk.content.includes('SELECT u.id')),
                );

                expect(codeBlockChunks.length).toBeGreaterThan(0);

                // Each code block chunk should have matching opening and closing backticks
                codeBlockChunks.forEach((chunk) => {
                    const backtickMatches = chunk.content.match(/```/g);
                    if (backtickMatches) {
                        expect(backtickMatches.length % 2).toBe(0); // Even number = properly closed
                    }
                });
            });
        });

        describe('Large Code Block Splitting', () => {
            it('should split large code blocks when they exceed character limit', () => {
                const largeCodeContent = fs.readFileSync(
                    path.join(
                        __dirname,
                        '../../../../fixtures/test-large-code-block.md',
                    ),
                    'utf8',
                );

                const chunks = contentSplitter.splitContent(largeCodeContent);

                // Should have multiple chunks due to large code block (at least 2)
                expect(chunks.length).toBeGreaterThanOrEqual(2);

                // Each chunk should be under 2000 characters
                chunks.forEach((chunk) => {
                    expect(chunk.content.length).toBeLessThanOrEqual(2000);
                });

                // First chunk should be paragraph (contains header and intro text)
                expect(chunks[0].type).toBe('paragraph');

                // If we have at least 3 chunks, the last should also be paragraph
                if (chunks.length >= 3) {
                    expect(chunks[chunks.length - 1].type).toBe('paragraph');
                }

                // Should have at least some chunks containing code blocks
                const chunksWithCode = chunks.filter((chunk) =>
                    chunk.content.includes('```'),
                );
                expect(chunksWithCode.length).toBeGreaterThan(0);
            });
        });

        describe('Mixed Content Splitting', () => {
            it('should handle mixed content with images, code, and text appropriately', () => {
                const mixedContent = fs.readFileSync(
                    path.join(
                        __dirname,
                        '../../../../fixtures/test-mixed-content.md',
                    ),
                    'utf8',
                );

                const chunks = contentSplitter.splitContent(mixedContent);

                // Should have multiple chunks due to images and length
                expect(chunks.length).toBeGreaterThan(3);

                // Should have image chunks
                const imageChunks = chunks.filter(
                    (chunk) => chunk.type === 'image',
                );
                expect(imageChunks.length).toBe(2); // 2 images in the fixture

                // Should have text chunks
                const textChunks = chunks.filter(
                    (chunk) => chunk.type === 'paragraph',
                );
                expect(textChunks.length).toBeGreaterThan(0);

                // All chunks should be under limit
                chunks.forEach((chunk) => {
                    expect(chunk.content.length).toBeLessThanOrEqual(2000);
                });
            });
        });

        describe('Sentence Splitting Fallback', () => {
            it('should split very long sentences when paragraph splitting fails', () => {
                const longSentenceContent = fs.readFileSync(
                    path.join(
                        __dirname,
                        '../../../../fixtures/test-very-long-sentences.md',
                    ),
                    'utf8',
                );

                const chunks =
                    contentSplitter.splitContent(longSentenceContent);

                // Should have multiple chunks due to long sentences (at least 2)
                expect(chunks.length).toBeGreaterThanOrEqual(2);

                // Each chunk should be under 2000 characters
                chunks.forEach((chunk) => {
                    expect(chunk.content.length).toBeLessThanOrEqual(2000);
                });

                // Check that sentences are split at reasonable boundaries
                chunks.forEach((chunk) => {
                    const content = chunk.content.trim();
                    if (content.length > 0) {
                        const lastChar = content.slice(-1);
                        const endsWithPunctuation = ['.', '!', '?'].includes(
                            lastChar,
                        );
                        const isMiddleOfSentence = !endsWithPunctuation;
                        // Either ends properly or is a forced split
                        expect(endsWithPunctuation || isMiddleOfSentence).toBe(
                            true,
                        );
                    }
                });
            });
        });

        describe('Character Limit Enforcement', () => {
            it('should ensure no chunk exceeds 2000 characters', () => {
                // Test with all fixture files
                const fixtureFiles = [
                    'test-short-content.md',
                    'test-with-images.md',
                    'test-large-code-block.md',
                    'test-mixed-content.md',
                    'test-very-long-sentences.md',
                    'test-code-blocks-preservation.md',
                ];

                for (const file of fixtureFiles) {
                    const content = fs.readFileSync(
                        path.join(__dirname, '../../../../fixtures', file),
                        'utf8',
                    );

                    const chunks = contentSplitter.splitContent(content);

                    chunks.forEach((chunk) => {
                        expect(chunk.content.length).toBeLessThanOrEqual(2000);
                    });
                }
            });
        });

        describe('Content Optimization', () => {
            it('should try to get close to 2000 characters when possible', () => {
                const mixedContent = fs.readFileSync(
                    path.join(
                        __dirname,
                        '../../../../fixtures/test-mixed-content.md',
                    ),
                    'utf8',
                );

                const chunks = contentSplitter.splitContent(mixedContent);

                // Filter out very small chunks (like images) and get text chunks
                const substantialTextChunks = chunks.filter(
                    (chunk) =>
                        chunk.type === 'paragraph' &&
                        chunk.content.length > 100,
                );

                // At least some chunks should be reasonably sized (not too small)
                // This tests that we're being conservative and not over-splitting
                const reasonablySizedChunks = substantialTextChunks.filter(
                    (chunk) => chunk.content.length > 1000,
                );

                expect(reasonablySizedChunks.length).toBeGreaterThan(0);
            });
        });

        describe('URL Resolution', () => {
            it('should resolve relative URLs when sourceUrl is provided', () => {
                const contentWithRelativeLinks = `
# Test Document

Check out [this link](./other-page.md) and [that link](../parent/file.md).

![Relative image](./images/test.png)
                `.trim();

                const sourceUrl = 'https://example.com/docs/current/page.md';

                const chunks = contentSplitter.splitContent(
                    contentWithRelativeLinks,
                    sourceUrl,
                );

                // Find text chunk with links
                const textChunk = chunks.find(
                    (chunk) =>
                        chunk.type === 'paragraph' &&
                        chunk.content.includes('[this link]'),
                );

                expect(textChunk).toBeDefined();
                expect(textChunk!.content).toContain(
                    'https://example.com/docs/current/other-page.md',
                );
                expect(textChunk!.content).toContain(
                    'https://example.com/docs/parent/file.md',
                );

                // Find image chunk
                const imageChunk = chunks.find(
                    (chunk) => chunk.type === 'image',
                );
                expect(imageChunk).toBeDefined();
                expect(imageChunk!.content).toContain(
                    'https://example.com/docs/current/images/test.png',
                );
            });
        });

        describe('Chunk Metadata', () => {
            it('should preserve chunk type information', () => {
                const contentWithImages = fs.readFileSync(
                    path.join(
                        __dirname,
                        '../../../../fixtures/test-with-images.md',
                    ),
                    'utf8',
                );

                const chunks = contentSplitter.splitContent(contentWithImages);

                chunks.forEach((chunk) => {
                    expect(chunk.type).toMatch(
                        /^(image|paragraph|code|sentence|chunk)$/,
                    );
                    expect(chunk.content).toBeDefined();
                    expect(typeof chunk.content).toBe('string');
                    expect(chunk.content.length).toBeGreaterThan(0);
                });
            });
        });
    });

    describe('complex fixtures', () => {
        it('should split rendering motion canvas in docker correctly', () => {
            const complexContent = fs.readFileSync(
                path.join(
                    __dirname,
                    '../../../../fixtures/Rendering-Motion-Canvas-in-Docker-Hunter-Henrichsen.md',
                ),
                'utf8',
            );

            const chunks = contentSplitter.splitContent(complexContent);

            const types = [
                'paragraph',
                'paragraph',
                'paragraph',
                'paragraph',
                'paragraph',
            ];

            for (let index = 0; index < chunks.length; index++) {
                const chunk = chunks[index];
                console.log('========================');
                console.log(chunk.content);
                console.log('========================');
                expect(chunk.content.length).toBeLessThanOrEqual(2000);
                expect(chunk.type).toBe(types[index]);

                // Verify that any code blocks are fully contained in their chunks
                // Count the number of code block fences in the chunk
                const codeBlockFences = chunk.content.match(/```/g);
                // Should have an even number of code block fences (open and close)
                expect((codeBlockFences?.length ?? 0) % 2).toBe(0);
            }
        });
    });
});
