import { testScreen } from './support/screen';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';

import * as fixtures from './support/fixtures';
import * as SecureStore from 'expo-secure-store';
import type { RecordItem } from '../../src/lib/types';

const apiGet = vi.fn();
const apiPatch = vi.fn();
const apiDelete = vi.fn();
const navigate = vi.fn();
const setParams = vi.fn();
const setParentParams = vi.fn();

vi.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    React.useEffect(() => effect(), [effect]);
  },
}));

// The gesture-aware list needs the native gesture module; off-device the
// plain React Native list renders the same rows.
vi.mock('react-native-gesture-handler', async () => {
  const RN = await import('react-native');
  return { FlatList: RN.FlatList, RefreshControl: RN.RefreshControl };
});

vi.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  default: ({
    children,
    renderLeftActions,
    renderRightActions,
  }: {
    children: React.ReactNode;
    renderLeftActions?: () => React.ReactNode;
    renderRightActions?: () => React.ReactNode;
  }) => (
    <>
      {renderLeftActions?.()}
      {children}
      {renderRightActions?.()}
    </>
  ),
}));

vi.mock('@react-native-community/datetimepicker', () => ({
  default: () => null,
}));

vi.mock('../../src/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => apiGet(...args),
    patch: (...args: unknown[]) => apiPatch(...args),
    delete: (...args: unknown[]) => apiDelete(...args),
    post: vi.fn(),
  },
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong.',
  ApiError: class ApiError extends Error {},
}));

vi.mock('../../src/context/BusinessProfileContext', () => ({
  useBusinessProfiles: () => ({
    profiles: [fixtures.businessProfile],
    selected: fixtures.businessProfile,
    categories: fixtures.categories,
    categoriesLoading: false,
    categoriesError: null,
    loading: false,
    error: null,
    selectProfile: vi.fn(),
    refresh: vi.fn(),
    refreshCategories: vi.fn(),
    createCategory: vi.fn(),
  }),
  BusinessProfileProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const exportCsv = vi.fn();
vi.mock('../../src/lib/recordExport', () => ({ exportRecordsCsv: (...args: unknown[]) => exportCsv(...args) }));

const { RecordsScreen: TypedRecordsScreen } = await import('../../src/screens/records/RecordsListScreen');
const RecordsScreen = testScreen(TypedRecordsScreen);
const { ThemeProvider } = await import('../../src/context/ThemeContext');
const { beginServerStateSession, clearServerStateCache } = await import('../../src/lib/serverStateCache');

const navigation = {
  navigate,
  setParams,
  getParent: () => ({ setParams: setParentParams }),
};
const route = { params: {} };

function record(id: number, description: string): RecordItem {
  return {
    id,
    type: 'expense',
    businessProfileId: fixtures.businessProfile.id,
    categoryId: fixtures.categories[0]!.id,
    duplicateOfRecordId: null,
    date: '2026-08-20',
    description,
    amount: 1200,
    source: 'MANUAL_ENTRY',
    reviewStatus: 'Needs Review',
    duplicateStatus: 'Flagged',
    largeExpenseFlag: true,
    createdAt: '2026-08-20T02:00:00.000Z',
  };
}

async function renderScreen() {
  return render(
    <ThemeProvider initialMode="light">
      <RecordsScreen navigation={navigation} route={route} />
    </ThemeProvider>,
  );
}

beforeEach(async () => {
  await SecureStore.deleteItemAsync('finsight.exportChoice');
  clearServerStateCache();
  beginServerStateSession(7);
  apiGet.mockReset();
  apiPatch.mockReset().mockResolvedValue(undefined);
  apiDelete.mockReset().mockResolvedValue(undefined);
  navigate.mockReset();
  setParams.mockReset();
  setParentParams.mockReset();
  apiGet.mockImplementation(async (path: string) => {
    if (path === '/records/search') return { items: [record(1, 'Shop rent')], nextCursor: null };
    if (path === '/records/flagged/count') return { expenses: 0, sales: 0, total: 0 };
    if (path.includes('import')) return [];
    if (path === '/records/export/months') return { months: [
      { month: '2026-11', expenses: 10, sales: 3 },
      { month: '2026-02', expenses: 4, sales: 1 },
      { month: '2025-12', expenses: 2, sales: 0 },
    ] };
    throw new Error(`Unexpected path ${path}`);
  });
});

afterEach(async () => {
  await cleanup();
  exportCsv.mockReset();
});

async function openSheet() {
  exportCsv.mockResolvedValue(undefined);
  const q = await renderScreen();
  await fireEvent.press(await q.findByRole('button', { name: 'Export these records as a CSV file' }));
  return q;
}

describe('Records CSV export sheet', () => {
  it('exports any ticked months as one file, with the record count on the button', async () => {
    const q = await openSheet();
    // Nothing is filtered, so there is no "As filtered" choice.
    expect(q.queryByText('As filtered')).toBeNull();
    await fireEvent.press(q.getByText('Pick months'));
    await fireEvent.press(await q.findByRole('checkbox', { name: /^February 2026/ }));
    await fireEvent.press(q.getByRole('checkbox', { name: /^November 2026/ }));
    await fireEvent.press(q.getByText('Export 2 months · 18 records'));
    await waitFor(() => expect(exportCsv).toHaveBeenCalledWith(
      { businessProfileId: fixtures.businessProfile.id, type: 'all', months: '2026-02,2026-11' },
      'finsight-records-2026-02-to-2026-11',
    ));
  });

  it('ticks a whole year, filtered by the year chips, and counts only the chosen kind', async () => {
    const q = await openSheet();
    await fireEvent.press(q.getByRole('button', { name: /Records to export, Sales/ }));
    await fireEvent.press(q.getByText('Pick months'));
    await fireEvent.press(await q.findByRole('checkbox', { name: 'Whole of 2026' }));
    expect(q.getByText('Export 2 months · 4 records')).toBeTruthy();
    await fireEvent.press(q.getByText('2025'));
    expect(q.queryByRole('checkbox', { name: /^November 2026/ })).toBeNull();
    // December 2025 has no sales, so ticking it adds a month but no records.
    await fireEvent.press(q.getByRole('checkbox', { name: /^December 2025/ }));
    expect(q.getByText('Export 3 months · 4 records')).toBeTruthy();
  });

  it('exports everything for the business', async () => {
    const q = await openSheet();
    await fireEvent.press(q.getByText('Everything'));
    await fireEvent.press(await q.findByText('Export 20 records'));
    await waitFor(() => expect(exportCsv).toHaveBeenCalledWith({ businessProfileId: fixtures.businessProfile.id, type: 'all' }, 'finsight-all-records'));
  });

  it('holds the button until a month is picked', async () => {
    const q = await openSheet();
    await fireEvent.press(q.getByText('Pick months'));
    await q.findByRole('checkbox', { name: 'Whole of 2026' });
    await fireEvent.press(q.getByText('Pick at least one month'));
    expect(exportCsv).not.toHaveBeenCalled();
  });
});
