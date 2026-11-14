import Registro from '#models/registro'
import Video from '#models/video'
import { registroValidator } from '#validators/registro'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'

/**
 * RegistrosController: marcar vídeo como assistido (T11).
 */
export default class RegistrosController {
  /**
   * Cria um registro do usuário logado. Vídeo inexistente -> 404.
   * Sem unique user+vídeo: assistir de novo cria outro registro (rewatch).
   */
  async store({ params, request, response, auth, session }: HttpContext) {
    const video = await Video.findOrFail(params.id)
    const { data_assistido: data, nota } = await request.validateUsing(registroValidator)

    await Registro.create({
      userId: auth.getUserOrFail().id,
      videoId: video.id,
      dataAssistido: data ?? DateTime.now(),
      nota: nota ?? null,
    })

    session.flash('success', 'Registrado!')
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
