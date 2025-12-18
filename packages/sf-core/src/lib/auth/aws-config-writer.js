import fs from 'fs'
import path from 'path'

class ConfigWriter {
  constructor() {
    this.SECTION_REGEX = /^\[(?<header>[^\]]+)\]/
    this.OPTION_REGEX = /(?<option>[^:=][^:=]*)\s*(?<vi>[:=])\s*(?<value>.*)$/
  }

  updateConfig(newValues, configFilename) {
    const sectionName = newValues.__section__ || 'default'
    delete newValues.__section__

    if (!fs.existsSync(configFilename)) {
      this._createFile(configFilename)
      this._writeNewSection(sectionName, newValues, configFilename)
      return
    }

    const contents = fs.readFileSync(configFilename, 'utf-8').split('\n')
    // Split file into lines (without newlines); add '\n' when writing back.

    try {
      this._updateSectionContents(contents, sectionName, newValues)
      fs.writeFileSync(configFilename, contents.join('\n'))
    } catch (e) {
      if (e.message === 'SectionNotFoundError') {
        this._writeNewSection(sectionName, newValues, configFilename)
      } else {
        throw e
      }
    }
  }

  _createFile(configFilename) {
    const dirname = path.dirname(configFilename)
    if (!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true })
    }
    fs.closeSync(fs.openSync(configFilename, 'w'))
    fs.chmodSync(configFilename, 0o600)
  }

  _writeNewSection(sectionName, newValues, configFilename) {
    const needsNewline = this._checkFileNeedsNewline(configFilename)
    const fd = fs.openSync(configFilename, 'a')
    if (needsNewline) {
      fs.writeSync(fd, '\n')
    }
    fs.writeSync(fd, `[${sectionName}]\n`)
    for (const [key, value] of Object.entries(newValues)) {
      if (value !== null && value !== undefined) {
        fs.writeSync(fd, `${key} = ${value}\n`)
      }
    }
    fs.closeSync(fd)
  }

  _checkFileNeedsNewline(filename) {
    const stats = fs.statSync(filename)
    if (stats.size === 0) return false
    const buffer = Buffer.alloc(1)
    const fd = fs.openSync(filename, 'r')
    fs.readSync(fd, buffer, 0, 1, stats.size - 1)
    fs.closeSync(fd)
    return buffer.toString() !== '\n'
  }

  _findSectionStart(contents, sectionName) {
    for (let i = 0; i < contents.length; i++) {
      const line = contents[i].trim()
      if (line.startsWith('#') || line.startsWith(';')) {
        continue
      }
      const match = this.SECTION_REGEX.exec(line)
      if (match && this._matchesSection(match, sectionName)) {
        return i
      }
    }
    throw new Error('SectionNotFoundError')
  }

  _matchesSection(match, sectionName) {
    const parts = sectionName.split(' ')
    const header = match.groups.header
    const unquotedMatch = header === sectionName
    if (parts.length > 1) {
      // Handle [profile "name"] format
      const profileName = parts.slice(1).join(' ')
      const quotedMatch = header === `${parts[0]} "${profileName}"`
      return unquotedMatch || quotedMatch
    }
    return unquotedMatch
  }

  _updateSectionContents(contents, sectionName, newValues) {
    const sectionStartLineNum = this._findSectionStart(contents, sectionName)
    let lastMatchingLine = sectionStartLineNum
    let j = lastMatchingLine + 1

    while (j < contents.length) {
      const line = contents[j]
      // Check if we hit next section
      if (this.SECTION_REGEX.test(line)) {
        this._insertNewValues(lastMatchingLine, contents, newValues)
        return
      }

      const match = this.OPTION_REGEX.exec(line)
      if (match) {
        lastMatchingLine = j
        const keyName = match.groups.option.trim()
        if (Object.prototype.hasOwnProperty.call(newValues, keyName)) {
          const optionValue = newValues[keyName]
          if (optionValue === null) {
            // Remove line for null value
            contents.splice(j, 1)
            j-- // Adjust index
            lastMatchingLine--
          } else {
            // Update value for existing key
            contents[j] = `${keyName} = ${optionValue}`
          }
          delete newValues[keyName]
        }
      }
      j++
    }

    if (Object.keys(newValues).length > 0) {
      this._insertNewValues(lastMatchingLine, contents, newValues)
    }
  }

  _insertNewValues(lineNumber, contents, newValues, indent = '') {
    const newLines = []
    for (const [key, value] of Object.entries(newValues)) {
      if (value !== null && value !== undefined) {
        newLines.push(`${indent}${key} = ${value}`)
      }
    }
    if (newLines.length > 0) {
      contents.splice(lineNumber + 1, 0, ...newLines)
    }
  }

  getValue(sectionName, key, configFilename) {
    if (!fs.existsSync(configFilename)) {
      return null
    }

    const contents = fs.readFileSync(configFilename, 'utf-8').split('\n')
    try {
      const sectionStartLineNum = this._findSectionStart(contents, sectionName)
      let j = sectionStartLineNum + 1

      while (j < contents.length) {
        const line = contents[j]
        if (this.SECTION_REGEX.test(line)) {
          return null
        }

        const match = this.OPTION_REGEX.exec(line)
        if (match) {
          const keyName = match.groups.option.trim()
          if (keyName === key) {
            return match.groups.value.trim()
          }
        }
        j++
      }
    } catch (e) {
      if (e.message === 'SectionNotFoundError') {
        return null
      }
      throw e
    }
    return null
  }
}

export default new ConfigWriter()
