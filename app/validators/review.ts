import vine from '@vinejs/vine'

/**
 * Formulário de review (T13): texto obrigatório (1 a 5000 caracteres, sem
 * espaços nas pontas) e a nota do registro, opcional de 1 a 5.
 */
export const reviewValidator = vine.create({
  texto: vine.string().trim().minLength(1).maxLength(5000),
  nota: vine.number().withoutDecimals().range([1, 5]).optional(),
})
