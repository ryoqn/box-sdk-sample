import { BoxClient, BoxDeveloperTokenAuth } from 'box-typescript-sdk-gen'
import { createHash } from 'crypto'
import fs from 'fs'
import { BoxApiError } from './types/boxApiError'
import { logger } from './util/logger'
import 'dotenv/config'
import path from 'path'
import { Readable } from 'stream'

const BIG_FILE_SIZE = 20 * 1024 * 1024

async function main(
  token: string,
  filePath: string,
  useManualUpload: boolean,
): Promise<void> {
  try {
    // authenticate
    const auth = new BoxDeveloperTokenAuth({ token })
    const client = new BoxClient({ auth })

    // get current time
    const currentTime = Date.now()
    const formattedTime = new Date(currentTime).toISOString()

    // create folder
    const folder = await client.folders.createFolder({
      name: `Folder_${formattedTime}`,
      parent: { id: '0' },
    })

    // calculate file size
    const stats = fs.statSync(filePath)
    const fileSize = stats.size
    const fileName = path.basename(filePath)

    const fileStream = fs.createReadStream(filePath)

    if (fileSize <= BIG_FILE_SIZE) {
      // upload the Small File
      // https://github.com/box/box-typescript-sdk-gen/blob/main/docs/uploads.md#upload-a-file
      const attr = { name: fileName, parent: { id: folder.id } }
      const body = { attributes: attr, file: fileStream }
      const files = await client.uploads.uploadFile(body)
      if (!files.entries || files.entries.length === 0) {
        throw new Error('No files were uploaded')
      }
      const uploadedFile = files.entries[0]

      logger.info('Small file uploaded successfully', {
        fileName: uploadedFile.name,
        fileId: uploadedFile.id,
      })
    } else if (!useManualUpload) {
      // https://github.com/box/box-typescript-sdk-gen/blob/main/docs/chunkedUploads.md#upload-big-file
      // upload the Big File
      const uploadedFile = await client.chunkedUploads.uploadBigFile(
        fileStream,
        fileName,
        fileSize,
        folder.id,
      )
      logger.info('Big file uploaded successfully', {
        fileName: uploadedFile.name,
        fileId: uploadedFile.id,
      })
    }
    // Manual Multi Part Upload
    else {
      await manualMultiPartUpload(
        client,
        folder.id,
        fileName,
        fileSize,
        filePath,
      )
      logger.info('Big file uploaded successfully', {
        fileName,
        folderId: folder.id,
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

async function manualMultiPartUpload(
  client: BoxClient,
  folderId: string,
  fileName: string,
  fileSize: number,
  filePath: string,
) {
  //https://github.com/box/box-typescript-sdk-gen/blob/main/docs/chunkedUploads.md#create-upload-session
  const PART_SIZE = 8 * 1024 * 1024
  // create stream
  const fileStream = fs.createReadStream(filePath, {
    highWaterMark: PART_SIZE,
  })
  const hash = createHash('sha1')
  const buffer = fs.readFileSync(filePath)
  hash.update(buffer)
  const digest = `sha=${hash.digest('base64')}`

  // Create an upload session
  const session = await client.chunkedUploads.createFileUploadSession({
    folderId: folderId,
    fileName: fileName,
    fileSize: fileSize,
  })
  if (!session.id) {
    throw new Error('Upload session could not be created')
  }

  // Upload the file in a multi part
  let offset = 0
  const parts = []
  for await (const chunk of fileStream) {
    if (!Buffer.isBuffer(chunk) && chunk instanceof Uint8Array) {
      throw new Error('Chunk must be a buffer')
    }
    const end = Math.min(offset + chunk.length, fileSize)

    // チャンクのSHA1ダイジェスト
    const chunkHash = createHash('sha1')
    chunkHash.update(chunk)
    const chunkDigest = `sha=${chunkHash.digest('base64')}`
    const chunkStream = Readable.from(chunk)
    const part = await client.chunkedUploads.uploadFilePart(
      session.id,
      chunkStream,
      {
        digest: chunkDigest,
        contentRange: `bytes ${offset}-${end - 1}/${fileSize}`,
      },
    )
    offset += chunk.length
    logger.info('Uploaded part', {
      offset,
      chunkSize: chunk.length,
      expectedPartSize: PART_SIZE,
    })
    parts.push(part)
  }

  // Commit the upload session
  await client.chunkedUploads.createFileUploadSessionCommit(
    session.id,
    {
      parts: parts.map((part) => ({
        partId: part.part?.partId,
        offset: part.part?.offset,
        size: part.part?.size,
        sha1: part.part?.sha1,
      })),
    },
    { digest: digest },
  )
}

const token = process.env.BOX_TOKEN
const filePath = process.env.UPLOAD_FILE_PATH
if (!token || !filePath) {
  throw new Error('BOX_TOKEN and UPLOAD_FILE_PATH must be set')
}
const useManualUpload = true
main(token, filePath, useManualUpload)
