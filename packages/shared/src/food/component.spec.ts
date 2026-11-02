import { describe, expect, it } from 'vitest';
import { linesByComponent } from './component.js';

describe('linesByComponent', () => {
  it('splits the lines into the main ones and each component’s, in their order', () => {
    const lines = [
      { name: 'ориз', component: null },
      { name: 'босилек', component: 0 },
      { name: 'брашно', component: 1 },
      { name: 'масло' },
      { name: 'зехтин', component: 0 },
    ];

    expect(linesByComponent(lines, 2, (line) => line.component)).toEqual({
      main: [lines[0], lines[3]],
      components: [[lines[1], lines[4]], [lines[2]]],
    });
  });

  it('a line of a component that is not there is a main one; a component without lines has none', () => {
    const lines = [{ component: 3 }, { component: -1 }];

    expect(linesByComponent(lines, 1, (line) => line.component)).toEqual({
      main: lines,
      components: [[]],
    });
  });
});
