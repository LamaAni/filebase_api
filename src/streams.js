const buff = Buffer.from(
  'this is a buffer with terminator\0after the terminator'
)

const stream = require('stream')

/**
 * Convert a stream to a buffer.
 * @param {stream.Readable} strm
 * @returns {Buffer} The generated buffer
 */
async function stream_to_buffer(strm) {
  return await new Promise((resolve, reject) => {
    const chunks = []
    strm.on('data', (chunk) => {
      chunks.push(chunk)
    })
    strm.on('error', (err) => reject(err))
    strm.on('end', () => {
      resolve(
        Buffer.concat(
          chunks.map((c) => (typeof c == 'string' ? Buffer.from([c]) : c))
        )
      )
    })
  })
}

/**
 * Split an incoming streams once, given a predict char value or function.
 * @param {stream.Readable | Buffer | string} buff
 * @param {(c:string)=>boolean|string} predict
 * @returns {[pre:stream.PassThrough, post:stream.PassThrough]} The pre and post streams
 */
function split_stream_once(buff, predict) {
  if (typeof predict == 'string') {
    const predict_char = predict
    predict = (c) => c == predict_char
  }

  const pre = new stream.PassThrough()
  const post = new stream.PassThrough()
  const process = new stream.PassThrough()

  if (!(buff instanceof stream.Readable))
    if (typeof buff == 'string') buff = stream.Readable.from([buff])
    else buff = stream.Readable.from(buff)

  buff.pipe(process)

  let is_pipe_post = false
  process.on('end', () => {
    pre.end()
    post.end()
  })
  process.on('data', (chunk) => {
    if (is_pipe_post) return
    const pre_chunk = []
    const post_chunk = []

    for (let c of chunk) {
      if (is_pipe_post) {
        post_chunk.push(c)
        continue
      }

      if (predict(String.fromCharCode(c))) {
        is_pipe_post = true
      } else {
        pre_chunk.push(c)
      }
    }

    if (pre_chunk.length > 0) {
      pre.write(Buffer.from(pre_chunk))
      if (is_pipe_post) pre.end()
    }

    if (post_chunk.length > 0) post.write(Buffer.from(post_chunk))
    if (is_pipe_post) buff.pipe(post)
  })

  return [pre, post]
}

module.exports = {
  stream_to_buffer,
  split_stream_once,
}
