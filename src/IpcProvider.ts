import * as Web3 from 'web3'
import * as net from 'net'
import * as _ from 'lodash'

export interface MethodCallback {
  method: string
  fun: Function
}

export class InvalidConnection extends Error {
  constructor (host: string) {
    super('CONNECTION ERROR: Couldn\'t connect to node '+ host +'.')
  }
}

export class InvalidResponse extends Error {
  constructor (result: any) {
    let message = !!result && !!result.error && !!result.error.message ? result.error.message : 'Invalid JSON RPC response: ' + JSON.stringify(result)
    super(message)
  }
}

function dechunk(data: string): Array<string> {
  return data
    .replace(/\}[\n\r]?\{/g,'}|--|{') // }{
    .replace(/\}\][\n\r]?\[\{/g,'}]|--|[{') // }][{
    .replace(/\}[\n\r]?\[\{/g,'}|--|[{') // }[{
    .replace(/\}\][\n\r]?\{/g,'}]|--|{') // }]{
    .split('|--|')
}

export default class IpcProvider implements Web3.Provider {
  path: string
  connection: net.Socket
  responseCallbacks: Map<number, MethodCallback>

  lastChunk?: string
  lastChunkTimeout?: NodeJS.Timer

  constructor (path: string) {
    this.path = path
    this.responseCallbacks = new Map()
    this.connection = net.connect({ path: this.path })
    this.connection.on('error', e => {
      console.error('IPC Connection Error', e)
      this._timeout()
    })

    this.connection.on('end', () => {
      this._timeout()
    })

    // LISTEN FOR CONNECTION RESPONSES
    this.connection.on('data', data => {
      this._parseResponse(data.toString()).forEach(result => {
        let id = null

        // get the id which matches the returned id
        if(_.isArray(result)) {
          result.forEach(load => {
            if (this.responseCallbacks.has(load.id)) {
              id = load.id
            }
          })
        } else {
          id = result.id
        }

        // fire the callback
        let callback = this.responseCallbacks.get(id)
        if (callback) {
          callback.fun(null, result)
          this.responseCallbacks.delete(id)
        }
      });
    });
  }

  sendAsync(payload: Web3.JSONRPCRequestPayload, callback: (err: Error, result: Web3.JSONRPCResponsePayload) => void): void {
    // try reconnect, when connection is gone
    if(!this.connection.writable) {
      this.connection.connect({path: this.path});
    }

    this.connection.write(JSON.stringify(payload));
    this._addResponseCallback(payload, callback);
  }

  private _parseResponse (data: string): Array<any> {
    let returnValues: Array<any> = []

    let dechunkedData = dechunk(data)

    dechunkedData.forEach(data => {
      // prepend the last chunk
      if (this.lastChunk) {
        data = this.lastChunk + data
      }

      let result: object | null = null

      try {
        result = JSON.parse(data)
      } catch(e) {
        this.lastChunk = data
        // start timeout to cancel all requests
        if (this.lastChunkTimeout) {
          clearTimeout(this.lastChunkTimeout)
        }
        this.lastChunkTimeout = setTimeout(() => {
          this._timeout()
          throw new InvalidResponse(data)
        }, 1000 * 15);

        return
      }

      // cancel timeout and set chunk to null
      if (this.lastChunkTimeout) {
        clearTimeout(this.lastChunkTimeout)
      }
      this.lastChunk = undefined

      if (result) {
        returnValues.push(result)
      }
    })

    return returnValues;
  }

  private _addResponseCallback (payload: Web3.JSONRPCRequestPayload | Array<Web3.JSONRPCRequestPayload>, callback: Function) {
    let id: number
    let method: string

    if (_.isArray(payload)) {
      id = payload[0].id
      method = payload[0].method
    } else {
      id = payload.id
      method = payload.method
    }

    this.responseCallbacks.set(id, {
      method: method,
      fun: callback
    })
  }

  private _timeout () {
    for(let key of this.responseCallbacks.keys()) {
      let callback = this.responseCallbacks.get(key)
      if (callback) {
        callback.fun(new InvalidConnection('on IPC'))
        this.responseCallbacks.delete(key)
      }
    }
  }
}
