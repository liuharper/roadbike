const _ = require(`lodash`)
const Promise = require(`bluebird`)
const path = require(`path`)
const req = require('require-yml')
const _docSidebarItems = req(`./src/xsjposts/docs/doc-links.yaml`)

const createHash = link => {
  let index = -1
  if (link) index = link.indexOf(`#`)
  return index >= 0 ? link.substr(index + 1) : false
}

const extenditemList = itemList => {
  itemList.forEach(section => {
    if (section && section.link){
      const hash = createHash(section.link)
      if (hash) {
        section.hash = hash
      }
    } 
    if (section.items) extendItem(section.items, section.title)
  })
  return itemList
}

const extendItem = (items, parentTitle) => {
  items.forEach(item => {
    item.hash = createHash(item.link)
    item.parentTitle = parentTitle
    if (item.items) extendItem(item.items, item.title)
  })
}

const docSidebarItems = extenditemList(_docSidebarItems).map(item => {
  return { ...item, key: `docs` }
})

exports.createPages = ({ graphql, actions }) => {
  const { createPage, createRedirect } = actions

  return new Promise((resolve, reject) => {
    const pageSize = 8;

    const docPostTemplate = path.resolve(`src/templates/template-docs-markdown.js`)
    const logPostTemplate = path.resolve(`src/templates/template-logs-markdown.js`)
    const blogPostTemplate = path.resolve(`src/templates/template-blog-post.js`)
    const paginatedPostsTemplate = path.resolve(`src/templates/template-blog-list.js`)
    const tagTemplate = path.resolve(`src/templates/tags.js`)

    resolve(
      graphql(
        `
          {
            allStoryWriterMarkdown(
              sort: { fields: [updateDate], order: DESC }, limit: 1000
            ) {
              edges {
                node {
                  title
                  toc
                  docType
                  slug
                  tags
                  updateDate
                  excerpt
                }
              }
            }
          }
        `
      ).then(result => {
        if (result.errors) {
          console.log(result.errors)
          reject(result.errors)
        }

        // Create blog posts pages.
        const posts = result.data.allStoryWriterMarkdown.edges
        const blogPosts = _.filter(result.data.allStoryWriterMarkdown.edges, edge=>{
          const docType = _.get(edge, `node.docType`)
          if (docType === `blogs`) {
            return edge
          }
          return undefined
        })

          // Tag pages:
          let tags = [];
          // Iterate through each post, putting all found tags into `tags`
          posts.forEach(edge => {
              if (_.get(edge, "node.tags")) {
                  tags = tags.concat(edge.node.tags);
              }
          });
          // Eliminate duplicate tags
          tags = _.uniq(tags);

          // Make tag pages
          tags.forEach(tag => {
              createPage({
                  path: `/tags/${_.kebabCase(tag)}/`,
                  component: tagTemplate,
                  context: {
                      tag,
                  },
              });
          });
        
        const logNodes = []
        const logSidebarItems = []
        posts.forEach(post => {
          if (post.node.docType === 'logs') {
            logNodes.push(post.node)
            logSidebarItems.push({
              title: post.node.title,
              link: encodeURI(`/logs/${post.node.slug}`),
              hash: false,
              disableExpandAll: true,
              key: 'logs'
            })
          }
          if (post.node.docType === 'docs') {
            createPage({
              path: `/docs/` + post.node.slug,
              component: docPostTemplate,
              context: {
                slug: post.node.slug,
                sidebarItems: docSidebarItems
              },
            })
          }
        })
        if (logNodes.length > 0 ){
          const logNode = logNodes[0]
          createRedirect({
            toPath: `/logs/${logNode.slug}`,
            fromPath: `/logs/`,
            redirectInBrowser: true,
            isPermanent: true
          })
        }
        logNodes.forEach(node=>{
          createPage({
            path: `/logs/` + node.slug,
            component: logPostTemplate,
            context: {
              slug: node.slug,
              sidebarItems: logSidebarItems
            },
          })
        })

        blogPosts.forEach((post, index) => {
          let related = posts.filter((p) => {
              if(p.node.slug === post.node.slug) {
                  return false;
              }

              var filteredTags = post.node.tags.filter((tag) => {
                  if(p.node.tags.indexOf(tag) !== -1) {
                      return true;
                  }
                  return false;
              });
              if(filteredTags && filteredTags.length > 0) {
                  return true;
              }

              return false;
          });

          related = _.shuffle(related).slice(0,6);
          let next = index === 0 ? null : blogPosts[index - 1].node
          const prev =
            index === blogPosts.length - 1 ? null : blogPosts[index + 1].node
          console.log(post.node.toc)
          let blogSidebarItems = null
          let enableScrollSync = null
          if (post.node.toc) {
            const _blogSidebarItems = JSON.parse(post.node.toc)
            if (_blogSidebarItems.length > 0) {
              const fixSlug = (items)=>{
                items.forEach((item)=>{
                  item.link = encodeURI(`/blog/${item.link}`)
                  if (item.items) {
                    fixSlug(item.items)
                  }
                })
              }
              fixSlug(_blogSidebarItems)
              enableScrollSync = true
              blogSidebarItems = extenditemList(_blogSidebarItems).map(item => {
                return { ...item, key: `blog` }
              })
            }
          }
          //const _blogSidebarItems = JSON.parse(post.node.toc)
         // const blogSidebarItems = extenditemList(_blogSidebarItems).map(item => {
         //   return { ...item, key: `blogs` }
         // })
          createPage({
            path: `/blog/` + post.node.slug,
            component: blogPostTemplate,
            context: {
              slug: post.node.slug,
              sidebarItems: blogSidebarItems,
              enableScrollSync,
              prev,
              next,
              related
            },
          })
        })

         // pagination blogPost
        const chunkedPosts = _.chunk(blogPosts, pageSize);
        chunkedPosts.forEach((chunk, index) => {
          let path = `/blog/`
          if (index > 0) {
            path = `/blog/page/${index+1}/`
          }
          createPage({
              path: path,
              component: paginatedPostsTemplate,
              context:
                  {
                    limit: pageSize,
                    skip: index * pageSize,
                    numPages: Math.ceil(blogPosts.length / pageSize),
                    currentPage: index + 1,
                  }
              ,
          })
        })
      })
    )
  })
}



exports.onPostBuild = () => {
//  fs.copySync(
//    `../docs/blog/2017-02-21-1-0-progress-update-where-came-from-where-going/gatsbygram.mp4`,
//    `./public/gatsbygram.mp4`
//  )
}

exports.onCreatePage = ({page, actions})=> {
  const { createPage } = actions
  console.log(page.path)
  if(page.path.indexOf(`/docs/`) === 0) {
    page.context.sidebarItems = docSidebarItems
    createPage(page)
  } else if (page.path.indexOf(`/logs/`) === 0) {
    createPage(page)
  } else {
    createPage(page)
  }
}
