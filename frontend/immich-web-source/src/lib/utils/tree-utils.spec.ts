import { getParentPath, getPathParts, joinPaths, TreeNode } from './tree-utils';

describe('tree-utils', () => {
  it('preserves Windows directory hierarchy', () => {
    expect(getPathParts('C:\\Gallery\\2024')).toEqual(['C:', 'Gallery', '2024']);
    expect(joinPaths('C:', 'Gallery')).toBe('C:\\Gallery');
    expect(joinPaths('C:\\Gallery', '2024')).toBe('C:\\Gallery\\2024');
    expect(getParentPath('C:\\Gallery\\2024')).toBe('C:\\Gallery');
  });

  it('creates separate nested nodes for a Windows path', () => {
    const tree = TreeNode.fromPaths(['C:\\Gallery\\2024', 'C:\\Gallery\\2025']);

    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]?.value).toBe('C:');
    expect(tree.children[0]?.children[0]?.value).toBe('Gallery');
    expect(tree.children[0]?.children[0]?.children.map((node) => node.value)).toEqual([
      '2024',
      '2025',
    ]);
  });
});
