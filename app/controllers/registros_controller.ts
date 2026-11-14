import Registro from '#models/registro'
import Review from '#models/review'
import Video from '#models/video'
import { registroValidator } from '#validators/registro'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

/**
 * RegistrosController: marcar vídeo como assistido (T11), com review opcional (T13).
 */
export default class RegistrosController {
  /**
   * Cria um registro do usuário logado. Vídeo inexistente -> 404.
   * Sem unique user+vídeo: assistir de novo cria outro registro (rewatch).
   */
  async store({ params, request, response, auth, session }: HttpContext) {
    const video = await Video.findOrFail(params.id)
    const {
      data_assistido: data,
      nota,
      review: texto,
    } = await request.validateUsing(registroValidator)

    // T13: campo "Review" preenchido -> registro + review na mesma transação
    await db.transaction(async (trx) => {
      const registro = await Registro.create(
        {
          userId: auth.getUserOrFail().id,
          videoId: video.id,
          dataAssistido: data ?? DateTime.now(),
          nota: nota ?? null,
        },
        { client: trx }
      )
      if (texto) {
        await Review.create({ registroId: registro.id, texto }, { client: trx })
      }
    })

    session.flash('success', texto ? 'Registrado! Review publicada!' : 'Registrado!')
    return response.redirect().toRoute('videos.show', { id: video.id })
  }

  /**
   * Remove um registro. Só o dono pode; senão 403.
   */
  async destroy({ params, response, auth, session }: HttpContext) {
    const registro = await Registro.findOrFail(params.id)
    if (registro.userId !== auth.getUserOrFail().id) {
      return response.forbidden('Você não pode remover este registro')
    }

    await registro.delete()
    session.flash('success', 'Registro removido.')
    return response.redirect().toRoute('videos.show', { id: registro.videoId })
  }
}
