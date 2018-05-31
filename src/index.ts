import Bouncer from './Bouncer'
import * as fs from 'fs'

const IPC = String(process.env.IPC)
const WHITELIST_PATH = String(process.env.WHITELIST)

const whitelist = JSON.parse(fs.readFileSync(WHITELIST_PATH).toString()).whitelist

let bouncer = new Bouncer(IPC, whitelist)

bouncer.on('error', error => {
  console.error(error)
  setTimeout(() => {
    bouncer.stop()
    bouncer.start()
  }, 1000)
})

bouncer.on('removed', peer => {
  console.info('Removed peer', peer.id)
})

bouncer.start()
