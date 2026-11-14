import Canal from '#models/canal'
import Registro from '#models/registro'
import Review from '#models/review'
import User from '#models/user'
import Video from '#models/video'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'

async function criarRegistro() {
  const user = await User.create({ nome: 'Ana', email: 'ana@teste.com', password: 'senha12345' })
  const canal = await Canal.create({ youtubeId: '@CanalRev', nome: 'Canal Review' })
  const video = await Video.create({
    youtubeId: 'revrevrevre',
    titulo: 'Vídeo Review',
    canalId: canal.id,
    publicadoPor: user.id,
  })
  const registro = await Registro.create({
    userId: user.id,
    videoId: video.id,
    dataAssistido: DateTime.fromISO('2026-03-05'),
    nota: 3,
  })
  return { user, video, registro }
}

test.group('Review: criar, editar e excluir (T13)', (group) => {
  group.setup(() => testUtils.httpServer().start())
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('não logado vai para o login', async ({ client, assert }) => {
    const { registro } = await criarRegistro()
    const form = await client.get(`/registros/${registro.id}/review`).redirects(0)
    form.assertHeader('location', '/login')
    const post = await client
      .post(`/registros/${registro.id}/review`)
      .form({ texto: 'Oi' })
      .withCsrfToken()
      .redirects(0)
    post.assertHeader('location', '/login')
    assert.lengthOf(await Review.all(), 0)
  })

  test('cria review no próprio registro e ajusta a nota', async ({ client, assert }) => {
    const { user, video, registro } = await criarRegistro()
    const form = await client.get(`/registros/${registro.id}/review`).loginAs(user)
    form.assertStatus(200)
    form.assertTextIncludes('Vídeo Review')
    form.assertTextIncludes('Assistido em 05/03/2026')

    const resposta = await client
      .post(`/registros/${registro.id}/review`)
      .form({ texto: '  Muito bom!  ', nota: '5' })
      .withCsrfToken()
      .loginAs(user)
      .redirects(0)
    resposta.assertHeader('location', `/videos/${video.id}`)
    const review = await Review.findByOrFail('registro_id', registro.id)
    assert.equal(review.texto, 'Muito bom!')
    await registro.refresh()
    assert.equal(registro.nota, 5)
  })

  test('registro de outro usuário dá 403', async ({ client, assert }) => {
    const { registro } = await criarRegistro()
    const outro = await User.create({ nome: 'Bia', email: 'bia@teste.com', password: 'senha12345' })
    const form = await client.get(`/registros/${registro.id}/review`).loginAs(outro)
    form.assertStatus(403)
    const post = await client
      .post(`/registros/${registro.id}/review`)
      .form({ texto: 'Invasão' })
      .withCsrfToken()
      .loginAs(outro)
    post.assertStatus(403)
    assert.lengthOf(await Review.all(), 0)
  })

  test('registro inexistente dá 404', async ({ client }) => {
    const { user } = await criarRegistro()
    const resposta = await client.get('/registros/999999/review').loginAs(user)
    resposta.assertStatus(404)
  })

  test('segundo POST no mesmo registro atualiza sem duplicar', async ({ client, assert }) => {
    const { user, registro } = await criarRegistro()
    for (const texto of ['Primeira versão', 'Segunda versão']) {
      await client
        .post(`/registros/${registro.id}/review`)
        .form({ texto, nota: '' })
        .withCsrfToken()
        .loginAs(user)
    }
    const reviews = await Review.query().where('registro_id', registro.id)
    assert.lengthOf(reviews, 1)
    const form = await client.get(`/registros/${registro.id}/review`).loginAs(user)
    form.assertTextIncludes('Editar review')
    form.assertTextIncludes('>Segunda versão</textarea>')
    assert.equal(reviews[0].texto, 'Segunda versão')
    await registro.refresh()
    assert.isNull(registro.nota)
  })

  test('excluir review mantém o registro', async ({ client, assert }) => {
    const { user, video, registro } = await criarRegistro()
    const review = await Review.create({ registroId: registro.id, texto: 'Vou apagar' })
    const resposta = await client
      .post(`/reviews/${review.id}/excluir`)
      .withCsrfToken()
      .loginAs(user)
      .redirects(0)
    resposta.assertHeader('location', `/videos/${video.id}`)
    assert.isNull(await Review.find(review.id))
    assert.isNotNull(await Registro.find(registro.id))
  })

  test('excluir review de outro usuário dá 403', async ({ client, assert }) => {
    const { registro } = await criarRegistro()
    const outro = await User.create({ nome: 'Bia', email: 'bia@teste.com', password: 'senha12345' })
    const review = await Review.create({ registroId: registro.id, texto: 'Minha' })
    const resposta = await client
      .post(`/reviews/${review.id}/excluir`)
      .withCsrfToken()
      .loginAs(outro)
    resposta.assertStatus(403)
    assert.isNotNull(await Review.find(review.id))
  })

  test('texto vazio ou só espaços dá erro', async ({ client, assert }) => {
    const { user, registro } = await criarRegistro()
    for (const texto of ['', '   ']) {
      const resposta = await client
        .post(`/registros/${registro.id}/review`)
        .form({ texto })
        .header('referer', `/registros/${registro.id}/review`)
        .withCsrfToken()
        .loginAs(user)
      resposta.assertTextIncludes('field__error')
    }
    assert.lengthOf(await Review.all(), 0)
  })

  test('texto acima de 5000 caracteres dá erro', async ({ client, assert }) => {
    const { user, registro } = await criarRegistro()
    await client
      .post(`/registros/${registro.id}/review`)
      .form({ texto: 'a'.repeat(5001) })
      .withCsrfToken()
      .loginAs(user)
    assert.lengthOf(await Review.all(), 0)
  })

  test('atalho no "Marcar como assistido" cria registro + review', async ({ client, assert }) => {
    const { user, video } = await criarRegistro()
    await client
      .post(`/videos/${video.id}/registros`)
      .form({ nota: '4', review: 'Revi e gostei' })
      .withCsrfToken()
      .loginAs(user)
    const novo = await Registro.query()
      .where('user_id', user.id)
      .orderBy('id', 'desc')
      .preload('review')
      .firstOrFail()
    assert.equal(novo.nota, 4)
    assert.equal(novo.review.texto, 'Revi e gostei')
  })

  test('atalho com review vazia cria só o registro', async ({ client, assert }) => {
    const { user, video } = await criarRegistro()
    await client
      .post(`/videos/${video.id}/registros`)
      .form({ review: '   ' })
      .withCsrfToken()
      .loginAs(user)
    assert.lengthOf(await Registro.query().where('user_id', user.id), 2)
    assert.lengthOf(await Review.all(), 0)
  })

  test('tela do vídeo mostra review de outro usuário', async ({ client, assert }) => {
    const { video, registro } = await criarRegistro()
    await Review.create({ registroId: registro.id, texto: 'Review da Ana <b>x</b>' })
    const outro = await User.create({ nome: 'Bia', email: 'bia@teste.com', password: 'senha12345' })

    const resposta = await client.get(`/videos/${video.id}`).loginAs(outro)
    resposta.assertTextIncludes('Ana')
    resposta.assertTextIncludes('nota 3 — 05/03/2026')
    resposta.assertTextIncludes('Review da Ana &lt;b&gt;x&lt;/b&gt;')
    assert.notInclude(resposta.text(), '/reviews/')
  })

  test('tela do vídeo: links de escrever/editar e lista vazia', async ({ client, assert }) => {
    const { user, video, registro } = await criarRegistro()
    const sem = await client.get(`/videos/${video.id}`).loginAs(user)
    sem.assertTextIncludes('Escrever review')
    sem.assertTextIncludes('Ninguém escreveu uma review ainda.')

    await Review.create({ registroId: registro.id, texto: 'Minha review' })
    const com = await client.get(`/videos/${video.id}`).loginAs(user)
    com.assertTextIncludes('Editar review')
    com.assertTextIncludes(`/reviews/`)
    assert.notInclude(com.text(), 'Ninguém escreveu')
  })
})
