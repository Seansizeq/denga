const OWED_BY_ME_KEYWORDS = [
  'винен',
  'винна',
  'должен',
  'должна',
  'borrowed',
  'i owe',
];

const isDebtDirection = (value) => value === 'owed_to_me' || value === 'owed_by_me';

export const resolveDebtDirectionForMigration = ({ debtDirection, debtPhrase }) => {
  if (isDebtDirection(debtDirection)) {
    return { direction: debtDirection, shouldUpdate: false };
  }

  const phrase = String(debtPhrase ?? '').toLowerCase();
  const direction = OWED_BY_ME_KEYWORDS.some((keyword) => phrase.includes(keyword))
    ? 'owed_by_me'
    : 'owed_to_me';
  return { direction, shouldUpdate: true };
};

export const legacyDebtPhraseForDirection = (direction) =>
  direction === 'owed_by_me' ? 'я винен' : 'мені винні';
