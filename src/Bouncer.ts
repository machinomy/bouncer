import * as Web3 from 'web3'
import IpcProvider from './IpcProvider'
import * as debug from 'debug'
import * as events from 'events'

const log = debug('bouncer')

export function randomId (digits: number = 3) {
  const datePart = new Date().getTime() * Math.pow(10, digits)
  const extraPart = Math.floor(Math.random() * Math.pow(10, digits)) // 3 random digits
  return datePart + extraPart // 16 digits
}

function getPeers(web3: Web3): Promise<Array<Web3.Peer>> {
  let payload = {
    jsonrpc: '2.0',
    id: randomId(),
    method: 'admin_peers',
    params: []
  }
  return new Promise<Array<Web3.Peer>>((resolve, reject) => {
    web3.currentProvider.sendAsync(payload, (err, response) => {
      if (err) {
        reject(err)
      } else {
        let peers = response.result
        resolve(peers)
      }
    })
  })
}

async function removePeer(web3: Web3, id: string): Promise<void> {
  let payload = {
    jsonrpc: '2.0',
    id: randomId(),
    method: 'admin_removePeer',
    params: [id]
  }
  return new Promise<void>((resolve, reject) => {
    web3.currentProvider.sendAsync(payload, err => {
      err ? reject(err) : resolve()
    })
  })
}

export default class Bouncer extends events.EventEmitter {
  web3: Web3
  whitelist: Array<string>
  interval?: NodeJS.Timer

  constructor (ipcPath: string, whitelist: Array<string>) {
    super()
    this.web3 = new Web3(new IpcProvider(ipcPath))
    this.whitelist = whitelist
  }

  start () {
    this.interval = setInterval(async () => {
      try {
        let peers = await getPeers(this.web3)
        log('Got peers', peers)
        peers.forEach(async peer => {
          if (!this.whitelist.includes(peer.id)) {
            await removePeer(this.web3, peer.id)
            this.emit('removed', peer)
            log('Removed peer', peer)
          }
        })
      } catch (e) {
        this.emit('error', e)
      }
    }, 1000)
  }

  stop () {
    if (this.interval) {
      clearInterval(this.interval)
    }
  }
}
