import { Client } from '@gradio/client'

export const huggingFaceAPI = async (captchaBlob) => {
  const client = await Client.connect('Nischay103/captcha_recognition')
  const result = await client.predict('/predict', {
    input: captchaBlob,
  })

  console.log(result.data)
  return (result.data && typeof result.data[0] === 'string') ? result.data[0].replace(/\||-/gi, '').substr(0, 10) : ''
}
