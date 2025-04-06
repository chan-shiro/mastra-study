import fs from 'fs';
import path from 'path';
import {
  extractWebsiteResearch,
  ResearchItem,
  checkTask,
  writeOutputToFile,
  addOutputToFile,
  pagesOutputParser,
  SearchPages,
  processBatch,
} from '../utils';

// Mock fs and path modules
jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  appendFileSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

jest.mock('path', () => ({
  join: jest.fn((dir, file) => `${dir}/${file}`),
}));

// Mock logger to avoid actual logging during tests
jest.mock('@mastra/core/logger', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('extractWebsiteResearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract research items correctly', () => {
    const markdown = `
# Website Research
[ ] 1. First research topic
[ ] 2. Second research topic
[ ]    3. Topic with spaces
# Another Section
Some other content
`;
    
    const expected: ResearchItem[] = [
      { number: 1, topic: 'First research topic', description: '' },
      { number: 2, topic: 'Second research topic', description: '' },
      { number: 3, topic: 'Topic with spaces', description: '' },
    ];

    expect(extractWebsiteResearch(markdown)).toEqual(expected);
  });

  it('should return empty array when Website Research section not found', () => {
    const markdown = `
# Some Other Section
[ ] 1. First research topic
`;
    
    expect(extractWebsiteResearch(markdown)).toEqual([]);
  });

  it('should return empty array when no items in Website Research section', () => {
    const markdown = `
# Website Research
No items here
# Another Section
`;
    
    expect(extractWebsiteResearch(markdown)).toEqual([]);
  });
});

describe('checkTask', () => {
  it('should mark specified task as completed', () => {
    const markdown = `
[ ] 1. First task
[ ] 2. Task to complete
[ ] 3. Another task
`;
    const expected = `
[x] 1. First task
[ ] 2. Task to complete
[ ] 3. Another task
`;
    
    expect(checkTask(markdown, 'First task')).toBe(expected);
  });

  it('should not modify already completed tasks', () => {
    const markdown = `
[x] 1. Already complete
[ ] 2. Task to complete
`;
    
    expect(checkTask(markdown, 'Already complete')). toBe(markdown);
  });

  it('should not modify markdown when task not found', () => {
    const markdown = `
[ ] 1. First task
[ ] 2. Second task
`;
    
    expect(checkTask(markdown, 'Non-existent task')).toBe(markdown);
  });
});

describe('file operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(true);
  });

  it('writeOutputToFile should write to correct path', () => {
    writeOutputToFile('content', 'test.md');
    
    expect(path.join).toHaveBeenCalledWith(expect.any(String), 'test.md');
    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), 'content');
  });

  it('addOutputToFile should append to correct path', () => {
    addOutputToFile('additional content', 'test.md');
    
    expect(path.join).toHaveBeenCalledWith(expect.any(String), 'test.md');
    expect(fs.appendFileSync).toHaveBeenCalledWith(expect.any(String), 'additional content');
  });

  it('should create directory if it does not exist', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    
    writeOutputToFile('content', 'test.md');
    
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });
});

describe('pagesOutputParser', () => {
  it('should parse search pages correctly', () => {
    const searchList = `
# Research Topic Intermittent fasting
Some description about intermittent fasting

# Pages
More info about pages

### Search query: intermittent fasting benefits
- [ ] https://example.com/article1
- [ ] https://example.com/article2

### Search query: intermittent fasting methods
- [ ] https://example.com/article3
- [ ] https://example.com/article4

# Research Topic Another topic
Another topic description

# Pages
More info about another topic

### Search query: another topic search
- [ ] https://example.com/article5
- [ ] https://example.com/article6
`;

    const expected: SearchPages[] = [
      {
        topic: "Intermittent fasting\nSome description about intermittent fasting",
        description: "More info about pages",
        query: "intermittent fasting benefits",
        links: ['https://example.com/article1', 'https://example.com/article2']
      },
      {
        topic: "Intermittent fasting\nSome description about intermittent fasting",
        description: "More info about pages",
        query: "intermittent fasting methods",
        links: ['https://example.com/article3', 'https://example.com/article4']
      },
      {
        topic: "Another topic\nAnother topic description",
        description: "More info about another topic",
        query: "another topic search",
        links: ['https://example.com/article5', 'https://example.com/article6']
      }
    ];

    expect(pagesOutputParser(searchList)).toEqual(expected);
  });

  it('should handle empty search list', () => {
    expect(pagesOutputParser('')).toEqual([]);
  });

  it('should handle search list with no links', () => {
    const searchList = `
# Research Topic Empty topic
Empty description

# Pages
No links here

### Search query: empty search
`;

    const expected: SearchPages[] = [
      {
        topic: "Empty topic\nEmpty description",
        description: "No links here",
        query: "empty search",
        links: []
      }
    ];

    expect(pagesOutputParser(searchList)).toEqual(expected);
  });
});

describe('processBatch', () => {
  // Set a longer timeout for this specific test
  it('should process items in batches', async () => {
    // Mock the internal delay but keep using the real setTimeout
    const spy = jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
      callback();
      return {} as any;
    });

    const items = [1, 2, 3, 4, 5];
    const processor = jest.fn().mockImplementation(item => Promise.resolve(item * 2));
    
    const results = await processBatch(items, 2, processor);
    
    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(processor).toHaveBeenCalledTimes(5);
    
    // Restore original setTimeout
    spy.mockRestore();
  }, 10000); // Increase timeout to 10 seconds

  it('should work with batch size larger than array', async () => {
    const items = [1, 2, 3];
    const processor = jest.fn().mockImplementation(item => Promise.resolve(item * 2));
    
    const results = await processBatch(items, 5, processor);
    
    expect(results).toEqual([2, 4, 6]);
    expect(processor).toHaveBeenCalledTimes(3);
  });

  it('should handle empty array', async () => {
    const processor = jest.fn();
    
    const results = await processBatch([], 2, processor);
    
    expect(results).toEqual([]);
    expect(processor).not.toHaveBeenCalled();
  });
});