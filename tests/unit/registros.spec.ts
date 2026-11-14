import Canal from '#models/canal'
import Registro from '#models/registro'
import User from '#models/user'
import Video from '#models/video'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'

async function criarVideo() {
  const user = await User.create({ nome: 'Ana', email: 'ana@teste.com', password: 'senha12345' })
  const canal = await Canal.create({ youtubeId: '@CanalReg', nome: 'Canal Registro' })
  const video = await Video.create({
    youtubeId: 'regregregre',
    titulo: 'Vídeo Registro',
    canalId: canal.id,
    publicadoPor: user.id,
  })
  return { user, video }
}

test.group('Marcar como assistido (T11)', (group) => {
  group.setup(() => testUtils.httpServer().start())
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('não logado vai para o login', async ({ client }) => {
    const { video } = await criarVideo()
    const resposta = await client.post(`/videos/${video.id}/registros`).withCsrfToken().redirects(0)
    resposta.assertStatus(302)
    resposta.assertHeader('location', '/login')
  })

  test('cria registro com nota', async ({ client, assert }) => {
    const { user, video } = await criarVideo()
    const resposta = await client
      .post(`/videos/${video.id}/registros`)
      .form({ data_assistido: '2026-01-10', nota: '4' })
      .withCsrfToken()
      .loginAs(user)
      .redirects(0)
    resposta.assertStatus(302)
    resposta.assertHeader('location', `/videos/${video.id}`)
    const registro = await Registro.findByOrFail('user_id', user.id)
    assert.equal(registro.nota, 4)
    assert.equal(registro.dataAssistido.toISODate(), '2026-01-10')
  })

  test('cria registro sem nota e sem data (padrão hoje)', async ({ client, assert }) => {
    const { user, video } = await criarVideo()
    await client
      .post(`/videos/${video.id}/registros`)
      .form({ data_assistido: '', nota: '' })
      .withCsrfToken()
      .loginAs(user)
    const registro = await Registro.findByOrFail('user_id', user.id)
    assert.isNull(registro.nota)
    assert.equal(registro.dataAssistido.toISODate(), DateTime.now().toISODate())
  })

  test('data futura dá erro', async ({ client, assert }) => {
    const { user, video } = await criarVideo()
    const amanha = DateTime.now().plus({ days: 1 }).toISODate()
    const resposta = await client
      .post(`/videos/${video.id}/registros`)
      .form({ data_assistido: amanha })
      .header('referer', `/videos/${video.id}`)
      .withCsrfToken()
      .loginAs(user)
    resposta.assertTextIncludes('field__error')
    assert.lengthOf(await Registro.all(), 0)
  })

  test('nota 0 ou 6 dá erro', async ({ client, assert }) => {
    const { user, video } = await criarVideo()
    for (const nota of ['0', '6']) {
      await client
        .post(`/videos/${video.id}/registros`)
        .form({ nota })
        .withCsrfToken()
        .loginAs(user)
    }
    assert.lengthOf(await Registro.all(), 0)
  })

  test('vídeo inexistente dá 404', async ({ client }) => {
    const { user } = await criarVideo()
    const resposta = await client.post('/videos/999999/registros').withCsrfToken().loginAs(user)
    resposta.assertStatus(404)
  })

  test('assistir 2x cria 2 registros e a tela mostra', async ({ client, assert }) => {
    const { user, video } = await criarVideo()
    for (const data of ['2026-01-01', '2026-02-03']) {
      await client
        .post(`/videos/${video.id}/registros`)
        .form({ data_assistido: data })
        .withCsrfToken()
        .loginAs(user)
    }
    assert.lengthOf(await Registro.query().where('user_id', user.id), 2)
    const resposta = await client.get(`/videos/${video.id}`).loginAs(user)
    resposta.assertTextIncludes('Você assistiu este vídeo 2 vez(es). A última foi em 03/02/2026.')
    resposta.assertTextIncludes('sem nota')
  })

  test('dono remove o registro', async ({ client, assert }) => {
    const { user, video } = await criarVideo()
    const registro = await Registro.create({
      userId: user.id,
      videoId: video.id,
      dataAssistido: DateTime.now(),
    })
    const resposta = await client
      .post(`/registros/${registro.id}/excluir`)
      .withCsrfToken()
      .loginAs(user)
      .redirects(0)
    resposta.assertHeader('location', `/videos/${video.id}`)
    assert.isNull(await Registro.find(registro.id))
  })

  test('remover registro de outro usuário dá 403', async ({ client, assert }) => {
    const { user, video } = await criarVideo()
    const outro = await User.create({ nome: 'Bia', email: 'bia@teste.com', password: 'senha12345' })
    const registro = await Registro.create({
      userId: user.id,
      videoId: video.id,
      dataAssistido: DateTime.now(),
    })
    const resposta = await client
      .post(`/registros/${registro.id}/excluir`)
      .withCsrfToken()
      .loginAs(outro)
    resposta.assertStatus(403)
    assert.isNotNull(await Registro.find(registro.id))
  })

  test('nota média ignora registros sem nota', async ({ client }) => {
    const { user, video } = await criarVideo()
    const outro = await User.create({ nome: 'Bia', email: 'bia@teste.com', password: 'senha12345' })
    const hoje = DateTime.now()
    await Registro.createMany([
      { userId: user.id, videoId: video.id, dataAssistido: hoje, nota: 4 },
      { userId: outro.id, videoId: video.id, dataAssistido: hoje, nota: 5 },
      { userId: outro.id, videoId: video.id, dataAssistido: hoje, nota: 5 },
      { userId: user.id, videoId: video.id, dataAssistido: hoje, nota: null },
    ])
    const resposta = await client.get(`/videos/${video.id}`).loginAs(user)
    resposta.assertTextIncludes('4,7 em 3 avaliações')
  })
})
