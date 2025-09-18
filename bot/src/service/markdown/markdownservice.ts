import { Service } from 'typedi';
import Logger from 'bunyan';
import TurndownService from 'turndown';
import { ScrapedContent } from '../scraper/scraperservice';

@Service()
export class MarkdownService {
    private turndown: TurndownService;

    constructor(private readonly logger: Logger) {
        this.turndown = new TurndownService({
            headingStyle: 'atx',
            bulletListMarker: '-',
            codeBlockStyle: 'fenced',
            emDelimiter: '*',
            strongDelimiter: '**',
            linkStyle: 'inlined',
            linkReferenceStyle: 'full',
        });
    }

    public convertToMarkdown(scrapedContent: ScrapedContent): string {
        const {
            title,
            content,
            url,
            timestamp,
            author,
            publicationDate,
            description,
            siteName,
        } = scrapedContent;

        // Create YAML frontmatter
        const frontmatter = this.createFrontmatter({
            title,
            url,
            author,
            publicationDate,
            description,
            siteName,
            archiveDate: timestamp,
        });

        const markdown = `${frontmatter}

${content}`;

        return markdown;
    }

    public createCombinedMarkdown(scrapedContents: ScrapedContent[]): string {
        if (scrapedContents.length === 0) {
            return '# No content scraped';
        }

        if (scrapedContents.length === 1) {
            return this.convertToMarkdown(scrapedContents[0]);
        }

        // For multiple pages, create a combined frontmatter
        const frontmatter = this.createCombinedFrontmatter(scrapedContents);

        let markdown = `${frontmatter}

# Scraped Content (${scrapedContents.length} links)

`;

        scrapedContents.forEach((content, index) => {
            markdown += `## ${index + 1}. ${content.title}

**Source:** [${content.url}](${content.url})  
**Scraped:** ${content.timestamp.toISOString()}

${content.content}

---

`;
        });

        return markdown;
    }

    public truncateContent(content: string, maxLength: number = 8000): string {
        if (content.length <= maxLength) {
            return content;
        }

        // Find a good truncation point (end of sentence)
        const truncated = content.substring(0, maxLength);
        const lastSentenceEnd = Math.max(
            truncated.lastIndexOf('.'),
            truncated.lastIndexOf('!'),
            truncated.lastIndexOf('?'),
        );

        if (lastSentenceEnd > maxLength * 0.8) {
            return (
                truncated.substring(0, lastSentenceEnd + 1) +
                '\n\n*[Content truncated]*'
            );
        }

        return truncated + '\n\n*[Content truncated]*';
    }

    private createFrontmatter(metadata: {
        title: string;
        url: string;
        author?: string;
        publicationDate?: Date;
        description?: string;
        siteName?: string;
        archiveDate: Date;
    }): string {
        const frontmatter: Record<string, any> = {
            title: metadata.title,
            source: metadata.url,
            archived: metadata.archiveDate.toISOString(),
        };

        if (metadata.author) {
            frontmatter.author = metadata.author;
        }

        if (metadata.publicationDate) {
            frontmatter.published = metadata.publicationDate.toISOString();
        }

        if (metadata.description) {
            frontmatter.description = metadata.description;
        }

        if (metadata.siteName) {
            frontmatter.site = metadata.siteName;
        }

        // Convert to YAML format
        const yamlLines = ['---'];
        for (const [key, value] of Object.entries(frontmatter)) {
            if (typeof value === 'string' && value.includes('\n')) {
                yamlLines.push(`${key}: |`);
                value.split('\n').forEach((line) => {
                    yamlLines.push(`  ${line}`);
                });
            } else {
                yamlLines.push(`${key}: ${JSON.stringify(value)}`);
            }
        }
        yamlLines.push('---');

        return yamlLines.join('\n');
    }

    private createCombinedFrontmatter(
        scrapedContents: ScrapedContent[],
    ): string {
        const frontmatter: Record<string, any> = {
            title: 'Scraped Content',
            sources: scrapedContents.map((content) => ({
                title: content.title,
                url: content.url,
                author: content.author,
                published: content.publicationDate?.toISOString(),
            })),
            archived: new Date().toISOString(),
        };

        // Convert to YAML format
        const yamlLines = ['---'];
        for (const [key, value] of Object.entries(frontmatter)) {
            if (Array.isArray(value)) {
                yamlLines.push(`${key}:`);
                value.forEach((item) => {
                    yamlLines.push('  -');
                    Object.entries(item).forEach(([subKey, subValue]) => {
                        if (subValue !== undefined) {
                            yamlLines.push(
                                `    ${subKey}: ${JSON.stringify(subValue)}`,
                            );
                        }
                    });
                });
            } else {
                yamlLines.push(`${key}: ${JSON.stringify(value)}`);
            }
        }
        yamlLines.push('---');

        return yamlLines.join('\n');
    }
}
