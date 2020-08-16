export async function promiseSafeSync(promise: Promise<any>): Promise<any> {
    return await promise
        .then(data => {return data})
        .catch(e => {throw e})
}
