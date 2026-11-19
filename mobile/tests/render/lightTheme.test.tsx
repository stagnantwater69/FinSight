import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { LightTheme, ThemeProvider, useThemeControl } from '../../src/context/ThemeContext';

function Mode() {
  const { mode, preference } = useThemeControl();
  return <Text>{`${mode}/${preference}`}</Text>;
}

describe('LightTheme', () => {
  it('paints the signed-out screens light while the owner has Dark picked, and keeps the choice', async () => {
    const queries = await render(
      <ThemeProvider initialMode="dark">
        <Mode />
        <LightTheme><Mode /></LightTheme>
      </ThemeProvider>,
    );
    expect(queries.getByText('dark/dark')).toBeTruthy();
    expect(queries.getByText('light/dark')).toBeTruthy();
  });
});
