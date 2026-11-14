import Registro from '#models/registro'
import Review from '#models/review'
import Video from '#models/video'
import YoutubeClient, { VideoNaoEncontradoError } from '#services/youtube_client'
import { enviarVideo } from '#services/video_service'
import { enviarVideoValidator } from '#validators/video'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'

/**
 * VideosController: enviar vídeo (T09).
 */
export default class VideosController {
  /**
   * Busca local por título (T10): ILIKE com curingas escapados, 20 por página
   */
  async index({ request, view }: HttpContext) {
    const q = String(request.input('q', '')).trim()
    const page = Number(request.input('page', 1)) || 1

    const query = Video.query().preload('canal')
    if (q) {
      const termo = q.replace(/[\\%_]/g, (c) => `\\${c}`)
      query.whereRaw(`titulo ILIKE ? ESCAPE '\\'`, [`%${termo}%`])
    }
    const videos = await query
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .paginate(page, 20)

    videos.baseUrl('/videos').queryString(q ? { q } : {})
    return view.render('pages/videos/index', { videos, q })
  }

  /**
   * Tela com o campo de URL ou ID
   */
  async create({ view }: HttpContext) {
    return view.render('pages/videos/create')
  }

  /**
   * Busca os dados no YouTube e salva; se já existir, só redireciona para ele
   */
  async store({ request, response, auth, session }: HttpContext) {
    const { url } = await request.validateUsing(enviarVideoValidator)
    const youtube = new YoutubeClient()

    const youtubeId = youtube.extrairId(url)
    if (!youtubeId) {
      session.flashAll()
      session.flash('inputErrorsBag', { url: ['URL ou ID do YouTube inválido'] })
      return response.redirect().back()
    }

    try {
      const { video, jaExistia } = await enviarVideo(youtube, youtubeId, auth.getUserOrFail())
      session.flash(
        'success',
        jaExistia ? 'Esse vídeo já estava no ytboxd' : 'Vídeo enviado com sucesso'
      )
      return response.redirect().toRoute('videos.show', { id: video.id })
    } catch (error) {
      if (!(error instanceof VideoNaoEncontradoError)) throw error
      session.flashAll()
      session.flash('inputErrorsBag', {
        url: ['Vídeo não encontrado, privado ou sem permissão de embed'],
      })
      return response.redirect().back()
    }
  }

  /**
   * Detalhe do vídeo (T08): player embed + metadados. Inexistente -> 404.
   */
  async show({ params, view, auth }: HttpContext) {
    const video = await Video.query()
      .where('id', params.id)
      .preload('canal')
      .preload('publicador')
      .preload('tags', (q) => q.orderBy('nome'))
      .firstOrFail()

    // T11: registros do usuário logado (mais recente primeiro) e nota média do vídeo
    const meusRegistros = await Registro.query()
      .where('video_id', video.id)
      .where('user_id', auth.getUserOrFail().id)
      .orderBy('data_assistido', 'desc')
      .orderBy('id', 'desc')
      .preload('review')

    // T13: reviews de todos os usuários do vídeo, mais recentes primeiro
    // (filtro amigos/todos fica para a T17)
    const reviews = await Review.query()
      .whereHas('registro', (q) => q.where('video_id', video.id))
      .preload('registro', (q) => q.preload('user'))
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')

    const media = await Registro.query()
      .where('video_id', video.id)
      .whereNotNull('nota')
      .avg('nota as media')
      .count('* as total')
      .firstOrFail()
    const totalNotas = Number(media.$extras.total)
    const notaMedia = totalNotas ? Number(media.$extras.media).toFixed(1).replace('.', ',') : null

    return view.render('pages/videos/show', {
      video,
      meusRegistros,
      reviews,
      notaMedia,
      totalNotas,
      hoje: DateTime.now().toISODate(),
    })
  }
}
