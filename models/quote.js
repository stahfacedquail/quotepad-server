const Title = require("./title.js");
const Author = require("./author.js");
const Tag = require("./tag.js");

const NUM_RECENT_QUOTES = 5;

const processCreateQuoteRequest = (req, res) => {
    createQuote(req.body)
    .then(() => {
        console.log("Finito!");
        res.status(200).send("All good :)");
    })
    .catch(error => {
        console.log("ERROR!", error);
        res.status(500).send(error);
    });
};

const findQuoteById = (req, res) => {
    if(req.query) {
        if(req.query.full)
            return getQuoteWithAllAttributes(req, res);
    }

    new db.Quote({ id: req.params.id }).fetch({ require: false })
    .then(quote => {
        res.send(quote ? quote.toJSON() : null);
    });
};

const getQuoteWithAllAttributes = (req, res) => {
    let returnQuote = {};

    new db.Quote({ id: req.params.id }).fetch({ require: false, withRelated: [ "title", "authors", "tags" ] })
    .then(quote => {
        if(quote == null)  {
            returnQuote = null;
            return new Promise(resolve => resolve(null));
        }

        quote = quote.toJSON();
        returnQuote = quote;
        console.log("Quote before title fetch", quote);
        
        if(quote.title) {
            let relatedAttrs = [ "type" ];

            if(quote.authors.length == 0)
                relatedAttrs.push("authors"); //the quote does not have author relationships, but maybe its title does
            
            return new db.Title({ id: quote.title.id })
                    .fetch({ require: false, withRelated: relatedAttrs });
        } else {
            return new Promise(resolve => resolve(null));
        }
    })
    .then(titleWithTypeAndAuthors => {
        if(titleWithTypeAndAuthors) {
            titleWithTypeAndAuthors = titleWithTypeAndAuthors.toJSON();
            returnQuote.title.type = titleWithTypeAndAuthors.type;
            returnQuote.authors = returnQuote.authors.length == 0 ? titleWithTypeAndAuthors.authors : returnQuote.authors;
        }
        else {
            returnQuote.title = null;
        }
            
        res.send(returnQuote);
    })
    .catch(error => {
        console.log("ERROR", error);
        res.send(error);
    })
};

const getQuotes = (req, res) => {
    let getQuotesPromise;

    if(req.query.recent)
        getQuotesPromise = new db.Quotes()
            .orderBy("date_added", "DESC")
            .query(qb => qb.limit(NUM_RECENT_QUOTES))
            .fetch();
        
    else if(req.query.favourite)
        getQuotesPromise = new db.Quotes()
            .query(qb => qb.where({ is_favourite: true }))
            .fetch();
    
    else if(req.query.titleId)
        getQuotesPromise = new db.Quotes()
            .query(qb => qb.where({ title_id: req.query.titleId }))
            .fetch();

    else
        getQuotesPromise = new db.Quotes().fetch();

    getQuotesPromise
    .then(quotes => res.send(quotes.toJSON()))
    .catch(error => {
        console.log("ERROR", error);
        res.send(error);
    });
};

const updateQuote = (req, res) => {
    //scenarios:
    //--------------------------------
    //1. update is_favourite (quote)
    //2. update text (quote)
    //3. update title
    //4. update author(s) - all relative to the "new" title, if any
    //5. update title type
    //6. update tags - replace current with new and get rid of zombies
    return bookshelf.transaction(t => {
        let quoteUpdates = {};
        let originalQuote;

        if("is_favourite" in req.body)
            quoteUpdates.is_favourite = req.body.is_favourite;
        
        if("text" in req.body)
            quoteUpdates.text = req.body.text;
        
        let createTitle;
        let updateCurrentTitleType = false;
        if("title_id" in req.body) {
            if(req.body.title_id == null || req.body.title_id >= 0) //remove quote from title or assign quote to a different existing title
                quoteUpdates.title_id = req.body.title_id;
            else { //this is a new title that needs to be created
                createTitle = Title.createTitle({
                    value: req.body.title.value,
                    type_id: req.body.title.type_id
                }, t).then(newTitle => {
                    quoteUpdates.title_id = newTitle.get("id");
                });
            }
        } else if(req.body.title?.type_id) {
            //title not changed, but type was
            updateCurrentTitleType = true;
        }

        let createAuthors;
        if("authors" in req.body) {
            let newAuthors = req.body.authors.filter(author => author.id == -1);
            if(newAuthors.length > 0)
                createAuthors = Author.createAuthors(newAuthors, t).then(authors => {
                    newAuthors = authors.map(author => author.toJSON());
                    req.body.authors = req.body.authors.filter(author => author.id >= 0).concat(newAuthors).map(author => author.id);
                });
        }

        let getOriginalQuote = new db.Quote({
            id: req.params.id
        }).fetch()
        .then(quote => originalQuote = quote.toJSON())
        .then(() => {
            if(updateCurrentTitleType)
                return new db.Title({ id: originalQuote.title_id }).save({
                    type_id: req.body.title.type_id
                }, { transacting: t });
        });

        let numQuoteAuthors = new db.QuoteAuthor().where({ quote_id: req.params.id }).count().then(num => {
            numQuoteAuthors = num;
        });

        return Promise.all([
            getOriginalQuote,
            numQuoteAuthors,
            createAuthors || new Promise(resolve => resolve(null)),
            createTitle || new Promise(resolve => resolve(null)),
        ]).then(() => {
            //Different combinations of title_id supplied/not supplied and author changes supplied/not supplied dictate different responses

            if("title_id" in req.body) { //Title changed
                if(req.body.title_id == null) { //Title removed
                    if("authors" in req.body) { //... and authors were changed
                        //delete existing quote/author entries, if any
                        //If there are no quote/author entries, maybe there are authors who belonged to its former title
                        //in which case, the cleaning up will happen if it turns out the title is now a zombie title 
                        return new db.QuoteAuthor()
                        .where({ quote_id: req.params.id })
                        .destroy({require: false, transacting: t })
                        .then(() => {
                            //create new quote/author entries
                            return req.body.authors.map(
                                authorId => createQuoteAuthorEntry(req.params.id, authorId, t)
                            );                        
                        });
                    } else { //Title removed, but no author changes were made
                        //If the title has authors, assign the authors to the quote... if the quote doesn't already have authors!
                        if(numQuoteAuthors == 0)
                            return new db.TitleAuthors()
                            .where({ title_id: originalQuote.title_id })
                            .fetch()
                            .then(titleAuthors => {
                                return Promise.all(titleAuthors.toJSON().map(
                                    titleAuth => createQuoteAuthorEntry(req.params.id, titleAuth.author_id, t)
                                ));
                            });
                        
                        return new Promise(resolve => resolve(null));
                    }
                } else { //Title changed to sth new/existing
                    //Authors must be sent by default, whether empty or changed or same as old
                    //If the former title has authors associated with it, clean up will happen when we look for zombies
                    //If the current title has authors associated with it, the function below will compare the authors sent with
                    //the ones on db and if they match, no further changes
                    //But if they don't, then it will change the title/author associations into quote/author associations
                    //If the quote had authors associated with it, we need to remove those and then create relationships with authors anew
                    
                    let removeOldQuoteAuthorAssociations = new Promise(resolve => resolve(null));
                    if(numQuoteAuthors > 0)
                        removeOldQuoteAuthorAssociations = new db.QuoteAuthor().where({
                            quote_id: req.params.id
                        }).destroy({ transacting: t });
                    
                    return removeOldQuoteAuthorAssociations.then(() => {
                        if(createTitle) //if this quote now belongs to a newly-created title, create title/author associations
                            return req.body.authors.map(author => {
                                new db.TitleAuthor().save({
                                    title_id: req.body.title_id,
                                    author_id: author.id
                                }, { transacting: t });
                            });
                        else //otherwise, look and see if incoming authors match the new title's authors, then create quote/author associations if need be
                            return createQuoteBelongingRelationship(req.params.id, req.body.title_id, req.body.authors, t);
                    });
                }
            } else { //Title unchanged
                //Were author changes made?
                if("authors" in req.body) {
                    return createQuoteBelongingRelationship(req.params.id, originalQuote.title_id, req.body.authors, t);
                } else {
                    //No author updates; nothing further to be done
                }
            }
        }).then(() => {
            //Is the prev title a zombie title?
            return checkIfLastQuoteInTitle(originalQuote.title_id)
            .then(itWasTheLastQuoteInFormerTitle => {
                if(itWasTheLastQuoteInFormerTitle)
                    return Title.deleteTitle(originalQuote.title_id, t)
                else
                    return Promise.resolve(null);
            });
        }).then(titleDeleted => {
            //Clean up zombie authors
            return Author.cleanUpZombieAuthors(req.params.id, t, titleDeleted);
        }).then(() => {
            if("tags" in req.body)
                return createQuoteTagRelationships(req.params.id, req.body.tags, t, true);
        }).then(() => {
            new db.Quote({ id: req.params.id }).save(quoteUpdates, { transacting: t })
            .then(updatedModel => res.send(updatedModel.toJSON()))
        }).catch(error => {
            console.log("ERROR", error);
            res.send(error)
        });
    });
};

const deleteQuote = (req, res) => {
    //delete quote-tags
    //search for zombie tags and delete
    //delete quote-authors
    //delete quote
    //is this title a zombie title? delete corresponding title-author entries
    //then delete zombie title
    //search for zombie authors and delete

    let quoteToBeDeleted;
    let returnObj = {
        success: true,
        lastQuoteInTitle: false
    };

    new db.Quote({ id: req.params.id }).fetch()
    .then(obj => {
        quoteToBeDeleted = obj.toJSON()
        console.log("Quote to be deleted", quoteToBeDeleted);
    })
    .then(() => {
        return bookshelf.transaction(t => {
            return new db.QuoteTag()
                .where({ quote_id: req.params.id })
            .destroy({ transacting: t, require: false })
            .then(() => {
                console.log("Quote-tag associations deleted");
                return Tag.cleanUpZombieTags();
            })
            .then(() => {
                console.log("Delete quote-author relationships");
                return new db.QuoteAuthor()
                    .where({ quote_id: req.params.id })
                    .destroy({ transacting: t, require: false });
            })
            .then(() => {
                console.log("Delete quote");
                return new db.Quote()
                    .where({ id: req.params.id })
                    .destroy({ transacting: t });
            })
            .then(() => {
                if(quoteToBeDeleted.title_id)
                    return checkIfLastQuoteInTitle(quoteToBeDeleted.title_id)
                else
                    return Promise.resolve(null);

                /*if(quoteToBeDeleted.title_id) { //if the quote belonged title
                    console.log("Count how many quotes are left in the title");
                    return new db.Quote()
                        .where({ title_id: quoteToBeDeleted.title_id })
                    .count("id")
                    .then(numQuotesInTitle => {
                        console.log(`Number of quotes in title ${quoteToBeDeleted.title_id}`, numQuotesInTitle);
        
                        if(numQuotesInTitle == 1) { //the deleted quote was the last one in the title
                            returnObj.lastQuoteInTitle = true;
        
                            return new db.TitleAuthor()
                                .where({ title_id: quoteToBeDeleted.title_id })
                                .destroy({ transacting: t, require: false });
                        } else { //there are still other quotes in the title, so don't delete anything title-related
                            return new Promise(resolve => resolve(null));
                        }
                    });
                } else { //the quote didn't belong to a title, so we move on
                    return new Promise(resolve => resolve(null));
                }*/
            })
            .then(isLastQuoteInTitle => {
                if(isLastQuoteInTitle) {
                    returnObj.lastQuoteInTitle = true;
        
                    return Title.deleteTitle(quoteToBeDeleted.title_id, t);
                    /*return new db.TitleAuthor()
                        .where({ title_id: quoteToBeDeleted.title_id })
                        .destroy({ transacting: t, require: false });*/
                } else {
                    return new Promise(resolve => resolve(null));
                }
            })
            /*.then(mustDeleteTitle => {
                if(mustDeleteTitle) {
                    console.log("Title-author relationships deleted; next - delete title");
                    return new db.Title()
                        .where({ id: quoteToBeDeleted.title_id })
                        .destroy({ transacting: t });
                }

                return new Promise(resolve => resolve(null));
            })*/
            .then(titleDeleted => {
                console.log(`${titleDeleted ? "Title deleted. " : ""}Count the number of titleless or quoteless authors`);

                return Author.cleanUpZombieAuthors();
                /*
                let enquireAboutEmptyAuthorsBasedOnTitle = "";
                if(titleDeleted) { //get all the authors of the title which was deleted 
                    enquireAboutEmptyAuthorsBasedOnTitle += ("SELECT author_id " +
                        "FROM title_authors " +
                        `WHERE title_id = ${ parseInt(quoteToBeDeleted.title_id) } ` +
                        
                        "UNION ALL ");
                }
                
                //    Maybe the authors weren't attached to the title though; maybe they were attached to the quote
                //    In which case, also get all the authors that were attached to the quote deleted
                //    Next, make a list of all authors in db + num items they are still attached to (be it a title or a quote)
                //    and filter that list to those authors who only have 1 item left attached to them
                //    If the deleted quote/title's author is on this list, it means that the deleted quote/title
                //    was the only thing left attached to them, so they are now zombie authors

                return knex.raw( "SELECT DISTINCT author_id FROM (" +
                        enquireAboutEmptyAuthorsBasedOnTitle +
                        "SELECT author_id " +
                        "FROM quote_authors " +
                        "WHERE quote_id = ? " +
                    ") AS authors_on_trial WHERE author_id IN " +
                        "(SELECT author_id FROM " +
                            "(   SELECT title_id as item_id, author_id " +
                                "FROM title_authors " +
                                "UNION ALL " +
                                "SELECT quote_id as item_id, author_id " +
                                "FROM quote_authors" +
                            ") AS item_ids_per_author " +
                        "GROUP BY author_id " +
                        "HAVING COUNT(item_id) = 1" +
                    ");", [ req.params.id ]
                );
            })
            .then((titlelessAuthors) => {
                titlelessAuthors = titlelessAuthors.rows;
                console.log(`Delete ${ titlelessAuthors.length } titlelessAuthors`);
                console.log(titlelessAuthors);

                if(titlelessAuthors.length > 0) {
                    titlelessAuthors = titlelessAuthors.map(author =>
                        new db.Author()
                        .where({ id: author.author_id })
                        .destroy({ transacting: t })
                    );

                    return Promise.all(titlelessAuthors);
                }
                
                return new Promise(resolve => resolve(null));*/
            });
        });
    })
    .then(() => {
        console.log("Done doner donest!");
        res.send(returnObj);
    })
    .catch(error => {
        console.log("ERROR!", error);
        returnObj.success = false;
        returnObj.error = error;
        res.send(returnObj);
    });
};

const createQuote = details => {
    return bookshelf.transaction(t => {
        return new Promise((resolve, reject) => {
            if(details.quote.title_id == null) {
                //console.log("This quote does not belong to a title; on to the next step");
                return resolve(null);
            }

            if(details.quote.title_id >= 0) {
                //console.log("Existing title; on to the next step");
                return resolve(details.quote.title_id);
            }

            //console.log("Title does not exist yet; create");

            let titleObj = {};
            titleObj.value = details.title.value;
            if(details.title.type_id)
                titleObj.type_id = details.title.type_id;

            //new db.Title().save(titleObj, { transacting: t })
            Title.createTitle(titleObj, t)
            .then(newTitle => resolve(newTitle.get("id")))
            .catch(error => reject(error));
        })
        .then(titleId => {
            details.title.id = titleId;
            
            //console.log("Nice!  And now for the biz de la biz: creating the quote!");
            return new db.Quote().save({
                text: details.quote.text,
                title_id: details.title.id,
                date_added: new Date()
            }, { transacting: t });
        })
        .then(newQuote => {
            newQuote = newQuote.toJSON();
            //console.log("Quote creation done :)", newQuote);
            details.quote.id = newQuote.id;

            let newAuthors = details.authors.filter(author => author.id == -1);
            //console.log("Create new author entries", newAuthors);
            /*return Promise.all(
                newAuthors.map(newAuthor => new db.Author().save({ value: newAuthor.value }, { transacting: t }))
            );*/
            return Author.createAuthors(newAuthors, t);
        })
        .then(newAuthors => {
            //console.log(`${newAuthors.length} new authors created`);
            newAuthors = newAuthors.map(newAuthor => newAuthor.get("id"));

            details.authors = details.authors.filter(author => author.id >= 0).map(author => author.id);
            details.authors = details.authors.concat(newAuthors);
            //console.log("New and improved list of authors", details.authors);

            return createQuoteBelongingRelationship(details.quote.id, details.title_id, details.authors, t)
            /* if(req.body.quote.title_id) {
                if(req.body.quote.title_id >= 0) {
                    //1. if there are new authors [for this title], delete all title-author relationships for this title
                    //and allocate those authors to the existing quotes in the title
                    //2. create quote-author relationships for new quote
                    console.log("This is an existing title, and we need to check if the authors listed for it on the db match what's been sent");
                    return new db.TitleAuthors()
                    .where({ title_id: req.body.quote.title_id })
                    .orderBy("author_id", "ASC")
                    .fetch()
                    .then(titleAuthors => {
                        if(titleAuthors.length > 0) { //There are authors associated with the title
                            titleAuthors = titleAuthors.toJSON();
                            let existingAuthors = titleAuthors.map(titleAuthor => titleAuthor.author_id);
                            let authorListsMatch = true;
                            
                            //Does the list of authors received match the list of existing authors?
                            if(existingAuthors.length == req.body.authors.length) {
                                req.body.authors.sort((authorX, authorY) => {
                                    if(authorX > authorY) return 1;
                                    if(authorX < authorY) return -1;
                                    return 0;
                                });

                                for(let i = 0; authorListsMatch && i < existingAuthors.length; i++)
                                    if(existingAuthors[i] != req.body.authors[i])
                                        authorListsMatch = false;
                            } else {
                                authorListsMatch = false;
                            }

                            console.log("Existing authors for this title", existingAuthors);
                            console.log(`Author lists ${authorListsMatch ? "do" : "don't"} match!`);

                            if(authorListsMatch) {
                                //no changes to be made here
                                console.log("So no need to create quote-author relationships etc");
                                return new Promise(resolve => resolve([]));
                            } else {
                                console.log("So we need to remove the title-author bond and change the relationships to quote-author relationships");
                                //1. Fetch quotes under this title_id and create quote-author relationships using the existing authors for this title
                                //2. Delete all title-author relationships for this title
                                //3. Create quote-author relationship for new quote using req.body.authors
                                return new db.Quotes()
                                    .where({ title_id: req.body.quote.title_id })
                                .fetch({ columns: "id" })
                                .then(quotesInThisTitle => {
                                    quotesInThisTitle = quotesInThisTitle.toJSON();

                                    let quoteAuthorRelationships = [];
                                    for(let i = 0; i < existingAuthors.length; i++)
                                        quoteAuthorRelationships = quoteAuthorRelationships.concat(quotesInThisTitle.map(
                                            quote => new db.QuoteAuthor().save({ 
                                                quote_id: quote.id,
                                                author_id: existingAuthors[i]
                                            }, { transacting: t }))
                                        );

                                    return Promise.all(quoteAuthorRelationships);
                                })
                                .then(() => {
                                    return new db.TitleAuthor()
                                        .where({ title_id: req.body.quote.title_id })
                                        .destroy({ transacting: t, require: false });
                                })
                                .then(() => {
                                    return Promise.all(req.body.authors.map(author => 
                                            new db.QuoteAuthor()
                                            .save({
                                                quote_id: req.body.quote.id,
                                                author_id: author
                                            }, { transacting: t })
                                        )
                                    );
                                });
                            }
                        } else { //no authors associated with the title, so associate authors received with the quote directly
                            console.log("This title has no authors associated with it, so we will create quote-author relationships instead");
                            return Promise.all(req.body.authors.map(author => 
                                new db.QuoteAuthor()
                                .save({
                                    quote_id: req.body.quote.id,
                                    author_id: author
                                }, { transacting: t }))
                            );
                        }
                    });
                } else { //new title
                    //so just create the new title/author relationships
                    console.log("It's a brand new title, so let's set up some brand new relationships");
                    return Promise.all(
                        req.body.authors.map(
                            author => new db.TitleAuthor().save({
                                title_id: req.body.title.id,
                                author_id: author
                            }, { transacting: t })
                        )
                    );
                }
            } else { //quote doesn't belong to a title
                //create quote-author relationships
                console.log("This quote does not belong to a title, so we will create quote-author relationships");
                return Promise.all(req.body.authors.map(author =>
                    new db.QuoteAuthor()
                    .save({
                        quote_id: req.body.quote.id,
                        author_id: author
                    }, { transacting: t })
                ));
            } */
        })
        .then(() => {
            return createQuoteTagRelationships(details.quote.id, details.tags, t);
            
            /* let newTags = req.body.tags.filter(tag => tag.id == -1);
            console.log("Creating new tags", newTags);
            return Promise.all(
                newTags.map(tag => new db.Tag().save({ value: tag.value }, { transacting: t }))
            );
        })
        .then(newTags => {
            newTags = newTags.map(tag => { 
                return {
                    quote_id: req.body.quote.id,
                    tag_id: tag.get("id")
                }
            });

            let tagsToAssociateWithQuote = req.body.tags.filter(tag => tag.id >= 0).map(tag => { 
                return {
                    quote_id: req.body.quote.id,
                    tag_id: tag.id 
                }
            });
            tagsToAssociateWithQuote = tagsToAssociateWithQuote.concat(newTags);
            console.log(`About to create ${tagsToAssociateWithQuote.length} quote-tag relationships`);

            return Promise.all(tagsToAssociateWithQuote.map(tag => new db.QuoteTag().save(tag, { transacting: t }))); */
        });
    });
    
};

const checkIfLastQuoteInTitle = titleId => {
    console.log("Count how many quotes are left in the title");
    return new Promise(resolve => {
        new db.Quote()
            .where({ title_id: titleId })
        .count("id")
        .then(numQuotesInTitle => {
            console.log(`Number of quotes in title ${titleId}`, numQuotesInTitle);

            if(numQuotesInTitle == 1)
                resolve(true);
            else
                resolve(false);
        });
    });
};

const createQuoteAuthorEntry = (quoteId, authorId, trx) => {
    return new db.QuoteAuthor()
    .save({
        quote_id: quoteId,
        author_id: authorId
    }, { transacting: trx });
};

const createQuoteBelongingRelationship = (quoteId, titleId, incomingAuthors, trx) => {
    if(titleId == null) {
        //create QuoteAuthor relationships
        return Promise.all(incomingAuthors.map(
            authorId => createQuoteAuthorEntry(quoteId, authorId, trx)
        ));
    }

    //1. if there are new authors [for this title], delete all title-author relationships for this title
    //and allocate those authors to the existing quotes in the title
    //2. create quote-author relationships for new quote
    //console.log("This is an existing title, and we need to check if the authors listed for it on the db match what's been sent");
    return new db.TitleAuthors()
    .where({ title_id: titleId })
    .orderBy("author_id", "ASC")
    .fetch()
    .then(titleAuthors => {
        if(titleAuthors.length > 0) { //There are authors associated with the title
            titleAuthors = titleAuthors.toJSON();
            let existingAuthors = titleAuthors.map(titleAuthor => titleAuthor.author_id);
            let authorListsMatch = true;
            
            //Does the list of authors received match the list of existing authors?
            if(existingAuthors.length == incomingAuthors.length) {
                incomingAuthors.sort((authorX, authorY) => {
                    if(authorX > authorY) return 1;
                    if(authorX < authorY) return -1;
                    return 0;
                });

                for(let i = 0; authorListsMatch && i < existingAuthors.length; i++)
                    if(existingAuthors[i] != incomingAuthors[i])
                        authorListsMatch = false;
            } else {
                authorListsMatch = false;
            }

            //console.log("Existing authors for this title", existingAuthors);
            //console.log(`Author lists ${authorListsMatch ? "do" : "don't"} match!`);

            if(authorListsMatch) {
                //no changes to be made here
                //console.log("So no need to create quote-author relationships etc");
                return new Promise(resolve => resolve([]));
            } else {
                //console.log("So we need to remove the title-author bond and change the relationships to quote-author relationships");
                //1. Fetch quotes under this title_id and create quote-author relationships using the existing authors for this title
                //2. Delete all title-author relationships for this title
                //3. Create quote-author relationship for new quote using req.body.authors
                return new db.Quotes()
                    .where({ title_id: titleId })
                .fetch({ columns: "id" })
                .then(quotesInThisTitle => {
                    quotesInThisTitle = quotesInThisTitle.toJSON();

                    let quoteAuthorRelationships = [];
                    for(let i = 0; i < existingAuthors.length; i++)
                        quoteAuthorRelationships = quoteAuthorRelationships.concat(quotesInThisTitle.map(
                            quote => createQuoteAuthorEntry(quote.id, existingAuthors[i], trx)
                        ));

                    return Promise.all(quoteAuthorRelationships);
                })
                .then(() => {
                    return new db.TitleAuthor()
                        .where({ title_id: titleId })
                        .destroy({ transacting: trx });
                })
                .then(() => {
                    return Promise.all(incomingAuthors.map(
                        authorId => createQuoteAuthorEntry(quoteId, authorId, trx)
                    ));
                });
            }
        } else { //no authors associated with the title
            //console.log("This title has no authors associated with it, so we will create quote-author relationships instead");
            return Promise.all(incomingAuthors.map(
                authorId => createQuoteAuthorEntry(quoteId, authorId, trx)
            ))
            .then(() => {
                //But maybe in the event of an update, the incoming authors are now in alignment with
                //the other quotes' authors, so coalesce into title/author relationships, and destroy quote/author relationships
                //So let's check if the quote/author relationships are identical for all the quotes in this title
                return trx.raw(
                    `SELECT COUNT(*) FROM
                    (SELECT quotes.id, COUNT(quote_authors.author_id) AS numAuthorsForQuote, (
                            SELECT COUNT(DISTINCT quote_authors.author_id)
                            FROM quotes LEFT JOIN quote_authors
                            ON quotes.id = quote_authors.quote_id
                            WHERE quotes.title_id = ?
                        ) AS numAuthorsInTitle
                    FROM quotes LEFT JOIN quote_authors
                    ON quotes.id = quote_authors.quote_id
                    WHERE quotes.title_id = ?
                    GROUP BY quotes.id) AS subquotes
                    WHERE numAuthorsForQuote <> numAuthorsInTitle;`, [ titleId, titleId ]
                );
            })
            .then(numMismatches => {
                if(numMismatches.rows.length == 0) {
                    //the quotes all have the same set of authors now, so coalesce into title/author relationships
                    //and destroy quote/author relationships
                    new db.Quotes()
                    .where({ title_id: titleId })
                    .fetch({ columns: "id "})
                    .then(quotes => {
                        let destroyQuoteAuthor = quotes.toJSON().map(quote => new db.QuoteAuthor({
                                quote_id: quote.id
                            }).destroy({ transacting: trx })
                        );
                        let createTitleAuthor = incomingAuthors.map(authorId => new db.TitleAuthor().save({
                            title_id: titleId,
                            author_id: authorId
                        }, { transacting: trx }));

                        return Promise.all([
                            destroyQuoteAuthor,
                            createTitleAuthor
                        ]);
                    });
                }

                //else: the quotes have different authors to each other;
                //keep the relationships as quote/author relationships
            });
        }
    });
};

const createQuoteTagRelationships = (quoteId, tags, trx, replace = false) => {
    return new Promise(resolve => {
        if(replace) //this is an update; remove all current quote/tag associations and replace with incoming ones
            new db.QuoteTag().where({
                quote_id: req.params.id
            }).destroy({ transacting: trx }).then(() =>
                resolve(null));

        resolve(null);
    }).then(() => { //create new tags
        return Promise.all(tags.filter(tag => tag.id == -1).map(
            tag => Tag.createTag(tag)
        ));
    }).then(newTags => {
        newTags = newTags.map(tag => {
            return {
                quote_id: quoteId,
                tag_id: tag.get("id")
            };
        });

        let tagsToAssociateWithQuote = tags.filter(tag => tag.id >= 0).map(tag => { 
            return {
                quote_id: quoteId,
                tag_id: tag.id 
            }
        });
        tagsToAssociateWithQuote = tagsToAssociateWithQuote.concat(newTags);
        //console.log(`About to create ${tagsToAssociateWithQuote.length} quote-tag relationships`);

        return Promise.all(tagsToAssociateWithQuote.map(
            tag => new db.QuoteTag().save(tag, { transacting: trx })
        ));
    }).then(() => {
        if(replace) //this wasn't a quote creation op; it was an update and some tags might have lost relevance
            return Tag.cleanUpZombieTags();
    });
};

module.exports = {
    findQuoteById,
    getQuotes,
    updateQuote,
    deleteQuote,
    processCreateQuoteRequest,

    //for testing
    createQuote
};