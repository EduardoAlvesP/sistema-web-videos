import Registro from '#models/registro'
import Review from '#models/review'
import { reviewValidator } from '#validators/review'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

/**
 * ReviewsController: criar, editar e excluir review (T13).
 * A review é o texto de um registro do próprio usuário (0..1 por registro).
 */
export default class ReviewsController {
  /**
   * Formulário de criar/editar. Registro inexistente -> 404; de outro -> 403.
   */
  async edit({ params, view, response, auth }: HttpContext) {
    const registro = await Registro.query()
      .where('id', params.id)
      .preload('video')
      .preload('review')
      .firstOrFail()
    if (registro.userId !== auth.getUserOrFail().id) {
      return response.forbidden('Você não pode escrever review neste registro')
    }

    return view.render('pages/reviews/form', { registro, review: registro.review })
  }

  /**
   * Cria ou atualiza a review do registro e ajusta a nota. O unique em
   * registro_id garante no máximo 1 review; aqui reaproveitamos a existente.
   */
  async store({ params, request, response, auth, session }: HttpContext) {
    const registro = await Registro.findOrFail(params.id)
    if (registro.userId !== auth.getUserOrFail().id) {
      return response.forbidden('Você não pode escrever review neste registro')
    }

    const { texto, nota } = await request.validateUsing(reviewValidator)

    const criada = await db.transaction(async (trx) => {
      registro.useTransaction(trx)
      registro.nota = nota ?? null
      await registro.save()

      const existente = await Review.query({ client: trx })
        .where('registro_id', registro.id)
        .first()
      if (existente) {
        existente.texto = texto
        await existente.save()
        return false
      }
      await Review.create({ registroId: registro.id, texto }, { client: trx })
      return true
    })

    session.flash('success', criada ? 'Review publicada!' : 'Review atualizada.')
    return response.redirect().toRoute('videos.show', { id: registro.videoId })
  }

  /**
   * Apaga só a review; o registro (assisti + nota) continua.
   */
  async destroy({ params, response, auth, session }: HttpContext) {
    const review = await Review.query().where('id', params.id).preload('registro').firstOrFail()
    if (review.registro.userId !== auth.getUserOrFail().id) {
      return response.forbidden('Você não pode excluir esta review')
    }

    await review.delete()
    session.flash('success', 'Review excluída.')
    return response.redirect().toRoute('videos.show', { id: review.registro.videoId })
  }
}
