import { describe, it, expect } from 'vitest'
import { readUndoSteps } from './readUndo.js'

const readings = [
  { id: 1, startedOn: '2024-01-02', finishedOn: '2024-02-01', rating: 4 },
  { id: 2, startedOn: '2025-03-01', finishedOn: '2025-04-10', rating: 5 }
]

describe('readUndoSteps', () => {
  it('era Lido: recria a última leitura concluída igual', () => {
    expect(readUndoSteps('read', readings)).toEqual([
      { op: 'add', reading: { startedOn: '2025-03-01', finishedOn: '2025-04-10', rating: 5 } }
    ])
  })

  it('era Lendo: reabre a leitura em andamento', () => {
    expect(readUndoSteps('reading', [...readings, { id: 7, startedOn: '2026-10-01', finishedOn: null }]))
      .toEqual([{ op: 'reopen', readingId: 7 }])
  })

  it('era nada: apaga a leitura criada', () => {
    expect(readUndoSteps('none', [])).toEqual([{ op: 'unread' }])
  })

  it('era Quero ler: apaga a leitura e volta o Quero ler', () => {
    expect(readUndoSteps('want', [])).toEqual([{ op: 'unread' }, { op: 'want' }])
  })

  it('sem as leituras de antes não desfaz', () => {
    expect(readUndoSteps('read', null)).toBeNull()
    expect(readUndoSteps('reading', [])).toBeNull()
  })
})
