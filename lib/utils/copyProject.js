fs.copySync(source, destination, {
  filter: (src) => !src.includes('.git')  // ignore .git folder
});
