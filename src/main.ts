import { BoxClient, BoxDeveloperTokenAuth } from 'box-typescript-sdk-gen'
import { createHash } from 'crypto'
import fs from 'fs'
import { BoxApiError } from './types/boxApiError'
import { logger } from './util/logger'
import 'dotenv/config'

async function main(token: string) {
  try {
    // authenticate
    const auth = new BoxDeveloperTokenAuth({ token })
    const client = new BoxClient({ auth })

    // create folder
    const folder = await client.folders.createFolder({
      name: 'test-folder',
      parent: { id: '0' },
    })

    // calculate file size
    const stats = fs.statSync('test.zip')
    const fileSize = stats.size

    // create stream
    const fileStream = fs.createReadStream('test.zip')

    // Calculate SHA1 digest
    const hash = createHash('sha1')
    fileStream.pipe(hash)
    const digest = `sha=${hash.digest('base64')}`

    const session = await client.chunkedUploads.createFileUploadSession({
      folderId: folder.id,
      fileName: 'test.zip',
      fileSize: fileSize,
    })

    // Upload the file in a single part
    if (session.id) {
      await client.chunkedUploads.uploadFilePart(session.id, fileStream, {
        digest: digest,
        contentRange: `bytes 0-${fileSize - 1}/${fileSize}`,
      })
    }
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'name' in err &&
      (err as BoxApiError).name === 'BoxApiError'
    ) {
      const boxError = err as BoxApiError
      logger.error('Box API Error occurred', {
        code: boxError.responseInfo?.body.code,
        detail: boxError.responseInfo?.body.message,
      })
    } else {
      console.error(err)
    }
  }
}

const token = process.env.BOX_TOKEN
if (!token) {
  console.error('Please provide a Box token')
  process.exit(1)
}
main(token)
