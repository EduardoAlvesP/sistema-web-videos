import vine from '@vinejs/vine'

/**
 * Marcar como assistido (T11): data opcional (padrão hoje, não pode ser futura)
 * e nota opcional de 1 a 5.
 */
export const registroValidator = vine.create({
  data_assistido: vine
    .date({ formats: ['YYYY-MM-DD'] })
    .beforeOrEqual('today')
    .optional(),
  nota: vine.number().withoutDecimals().range([1, 5]).optional(),
})
