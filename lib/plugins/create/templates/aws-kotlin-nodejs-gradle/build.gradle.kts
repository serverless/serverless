plugins {
  id("org.jetbrains.kotlin.js") version "1.3.41"
}
repositories {
  mavenCentral()
}

group = "serverless-kotlin-node"
version = "1.0-SNAPSHOT"

kotlin {
  target {
    useCommonJs()
    nodejs()
  }

  sourceSets["main"].dependencies {
    implementation(kotlin("stdlib-js"))
  }
}
