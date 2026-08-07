import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractPackageName,
  analyzeAccountGame,
  predictGameByAccountName,
  predictGameByAccountOrPackage,
  isValidPackageValue,
} from './game-package.utils.ts';
import type { Game } from '@grq/api-bindings';

const games: Game[] = [
  { id: 1, name: 'Club Vegas', package_name: 'com.bagelcode.slots1' },
  { id: 2, name: 'Eastern Spins', package_name: 'com.eastwealth.festive.spins' },
  { id: 3, name: 'Frosty Real', package_name: undefined },
];

describe('extractPackageName', () => {
  it('extracts a simple package value', () => {
    assert.equal(extractPackageName('package_name=com.bagelcode.slots1'), 'com.bagelcode.slots1');
  });

  it('stops at ampersand / whitespace / newline', () => {
    assert.equal(extractPackageName('package_name=com.x.y&event_token=z'), 'com.x.y');
    assert.equal(extractPackageName('package_name=com.x.y\nmore'), 'com.x.y');
  });

  it('is case-insensitive on the key', () => {
    assert.equal(extractPackageName('PACKAGE_NAME=com.abc'), 'com.abc');
  });

  it('returns null when absent', () => {
    assert.equal(extractPackageName('event_token=abc'), null);
    assert.equal(extractPackageName(null), null);
    assert.equal(extractPackageName(undefined), null);
  });
});

describe('isValidPackageValue', () => {
  it('accepts package-safe characters', () => {
    assert.equal(isValidPackageValue('com.example.app'), true);
    assert.equal(isValidPackageValue('com.example-app_v1'), true);
  });

  it('rejects empty / whitespace / symbols', () => {
    assert.equal(isValidPackageValue(''), false);
    assert.equal(isValidPackageValue('  '), false);
    assert.equal(isValidPackageValue('com.x/y'), false);
    assert.equal(isValidPackageValue('com.x=y'), false);
    assert.equal(isValidPackageValue(null), false);
    assert.equal(isValidPackageValue(undefined), false);
  });
});

describe('predictGameByAccountName', () => {
  it('predicts a matching game by keywords', () => {
    assert.equal(predictGameByAccountName('Club Vegas', games)?.id, 1);
  });

  it('returns null when nothing matches', () => {
    assert.equal(predictGameByAccountName('unrelated name', games), null);
  });
});

describe('predictGameByAccountOrPackage', () => {
  it('prefers the name prediction over the package', () => {
    const game = predictGameByAccountOrPackage(
      'Club Vegas',
      'package_name=com.eastwealth.festive.spins',
      games,
    );
    assert.equal(game?.id, 1);
  });

  it('falls back to the package when the name gives no hint', () => {
    const game = predictGameByAccountOrPackage(
      'unrelated name',
      'package_name=com.eastwealth.festive.spins',
      games,
    );
    assert.equal(game?.id, 2);
  });

  it('matches package case-insensitively', () => {
    const game = predictGameByAccountOrPackage(
      'unrelated name',
      'package_name=COM.BAGELCODE.SLOTS1',
      games,
    );
    assert.equal(game?.id, 1);
  });

  it('returns null when the package matches no game', () => {
    const game = predictGameByAccountOrPackage(
      'unrelated name',
      'package_name=com.unknown.xyz',
      games,
    );
    assert.equal(game, null);
  });

  it('returns null when no name hint and the package is absent or invalid', () => {
    assert.equal(predictGameByAccountOrPackage('unrelated name', 'event_token=abc', games), null);
    assert.equal(predictGameByAccountOrPackage('unrelated name', null, games), null);
    assert.equal(predictGameByAccountOrPackage('unrelated name', 'package_name=com.x/y', games), null);
  });
});

describe('analyzeAccountGame', () => {
  it('returns match when package equals the stored game package', () => {
    const r = analyzeAccountGame({
      accountName: 'Club Vegas',
      template: 'package_name=com.bagelcode.slots1',
      selectedGameId: 1,
      games,
    });
    assert.equal(r.status, 'match');
  });

  it('returns mismatch with otherGame when it belongs to another game', () => {
    const r = analyzeAccountGame({
      accountName: 'wrong',
      template: 'package_name=com.eastwealth.festive.spins',
      selectedGameId: 1,
      games,
    });
    assert.equal(r.status, 'mismatch');
    if (r.status === 'mismatch') {
      assert.equal(r.otherGame?.id, 2);
    }
  });

  it('returns mismatch without otherGame when no other game matches', () => {
    const r = analyzeAccountGame({
      accountName: 'wrong',
      template: 'package_name=com.unknown.xyz',
      selectedGameId: 1,
      games,
    });
    assert.equal(r.status, 'mismatch');
    if (r.status === 'mismatch') {
      assert.equal(r.otherGame, null);
    }
  });

  it('returns missing-package when the template lacks a package_name', () => {
    const r = analyzeAccountGame({
      accountName: 'Club Vegas',
      template: 'event_token=abc',
      selectedGameId: 1,
      games,
    });
    assert.equal(r.status, 'missing-package');
  });

  it('returns missing-package when the package value is invalid', () => {
    const r = analyzeAccountGame({
      accountName: 'Club Vegas',
      template: 'package_name=com.x/y',
      selectedGameId: 1,
      games,
    });
    assert.equal(r.status, 'missing-package');
  });

  it('returns unknown when no game is selected', () => {
    const r = analyzeAccountGame({
      accountName: 'Club Vegas',
      template: 'package_name=com.bagelcode.slots1',
      selectedGameId: undefined,
      games,
    });
    assert.equal(r.status, 'unknown');
  });

  it('returns game-no-package for a legacy game without a stored package', () => {
    const r = analyzeAccountGame({
      accountName: 'Frosty Real',
      template: 'package_name=com.whatever',
      selectedGameId: 3,
      games,
    });
    assert.equal(r.status, 'game-no-package');
    if (r.status === 'game-no-package') {
      assert.equal(r.otherGame, null);
    }
  });

  it('resolves otherGame in game-no-package when the package matches another game', () => {
    const r = analyzeAccountGame({
      accountName: 'Frosty Real',
      template: 'package_name=com.eastwealth.festive.spins',
      selectedGameId: 3,
      games,
    });
    assert.equal(r.status, 'game-no-package');
    if (r.status === 'game-no-package') {
      assert.equal(r.otherGame?.id, 2);
    }
  });
});
