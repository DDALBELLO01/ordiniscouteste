import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitDistinctiveMaterials } from '../exportService.js';

test('splits distinctive XLSX rows by description and recalculates their totals', () => {
  const materials = [{
    id: 1,
    nome: 'Distintivo',
    tipologia: 'Distintivo',
    costo_acquisto: 2,
    usato: 0,
    non_a_catalogo_scouting: 0,
    destinazioni: [
      { specialita: 'Topografia', quantita: 3, da_magazzino: 1, mancanti: 2, stato: 'prenotato', acquistato: 0 },
      { specialita: 'Primo soccorso', quantita: 2, da_magazzino: 0, mancanti: 0, stato: 'ordinato', acquistato: 1 },
      { specialita: 'Topografia', quantita: 1, da_magazzino: 0, mancanti: 0, stato: 'ricevuto', acquistato: 1 }
    ]
  }];

  const result = splitDistinctiveMaterials(materials);

  assert.equal(result.length, 2);
  const topografia = result.find(material => material.nome === 'Distintivo - Topografia');
  const firstAid = result.find(material => material.nome === 'Distintivo - Primo soccorso');
  assert.deepEqual(
    [topografia.richieste_totali, topografia.da_magazzino, topografia.da_acquistare, topografia.ricevuti, topografia.costo_da_acquistare],
    [4, 1, 2, 1, 4]
  );
  assert.deepEqual(
    [firstAid.richieste_totali, firstAid.gia_ordinati, firstAid.da_acquistare],
    [2, 2, 0]
  );
});

test('does not split non-distinctive products', () => {
  const material = { tipologia: 'Camicia', destinazioni: [{ quantita: 2 }] };
  assert.deepEqual(splitDistinctiveMaterials([material]), [material]);
});

test('includes the description when only one distinctive type was requested', () => {
  const [material] = splitDistinctiveMaterials([{
    nome: 'Distintivo',
    tipologia: 'Distintivo',
    destinazioni: [{ specialita: 'Topografia', quantita: 2, da_magazzino: 0, mancanti: 2, stato: 'prenotato' }]
  }]);

  assert.equal(material.nome, 'Distintivo - Topografia');
});