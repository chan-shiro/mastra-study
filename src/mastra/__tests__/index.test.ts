import { extractWebsiteResearch, checkTask } from '../index';

describe('extractWebsiteResearch', () => {
  it('should extract research items from markdown', () => {
    const markdown = `
# Website Research
Some instructions for the research task overview.

[ ] 1. Research Item One
  - Description for item one

[ ] 2. Research Item Two
  - Description for item two with more details

# Analyze the research output
Some other section
`;

    const result = extractWebsiteResearch(markdown);
    
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      number: 1,
      title: 'Research Item One',
      description: 'Description for item one',
    });
    expect(result[1]).toEqual({
      number: 2,
      title: 'Research Item Two',
      description: 'Description for item two with more details',
    });
  });

  it('should return empty array if Website Research section is not found', () => {
    const markdown = `
# Some Other Section
[ ] 1. Item One
  - Description for item one
`;

    const result = extractWebsiteResearch(markdown);
    
    expect(result).toEqual([]);
  });

  it('should handle empty Website Research section', () => {
    const markdown = `
# Website Research

# Other Section
`;

    const result = extractWebsiteResearch(markdown);
    
    expect(result).toEqual([]);
  });

  it('should extract items with complex descriptions', () => {
    const markdown = `
# Website Research
[ ] 1. Complex Item
  - This description has multiple sentences. It also has some formatting *like this* and **like this**.

[ ] 2. Another Item
  - Description with [links](https://example.com) and other elements.
`;

    const result = extractWebsiteResearch(markdown);
    
    expect(result).toHaveLength(2);
    expect(result[0].description).toBe('This description has multiple sentences. It also has some formatting *like this* and **like this**.');
    expect(result[1].description).toBe('Description with [links](https://example.com) and other elements.');
  });
});

describe('checkTask', () => {
  it('should mark a task as completed', () => {
    const markdown = `
# Research Tasks
[ ] 1. First Task
[ ] 2. Second Task
[ ] 3. Third Task
`;

    const result = checkTask(markdown, 'Second Task');
    
    expect(result).toContain('[x] 2. Second Task');
    expect(result).toContain('[ ] 1. First Task');
    expect(result).toContain('[ ] 3. Third Task');
  });

  it('should not modify the markdown if task is not found', () => {
    const markdown = `
# Research Tasks
[ ] 1. First Task
[ ] 2. Second Task
[ ] 3. Third Task
`;

    const result = checkTask(markdown, 'Fourth Task');
    
    expect(result).toBe(markdown);
  });

  it('should handle task names with special regex characters', () => {
    const markdown = `
# Research Tasks
[ ] 1. Task (with parentheses)
[ ] 2. Task [with brackets]
[ ] 3. Task with a period.
`;

    const result = checkTask(markdown, 'Task \\[with brackets\\]');
    
    expect(result).toContain('[x] 2. Task [with brackets]');
  });

  it('should only mark tasks that match the full task name', () => {
    const markdown = `
# Research Tasks
[ ] 1. Task One
[ ] 2. Task Two
[ ] 3. Another Task Two Plus
`;

    const result = checkTask(markdown, 'Task Two');
    
    expect(result).toContain('[x] 2. Task Two');
    expect(result).toContain('[ ] 3. Another Task Two Plus');
  });
});