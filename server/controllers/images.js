const fs = require('fs');
const path = require('path');
const Image = require('../models/image');

exports.getImage = async (req, res) => {
  await Image.findOne({ name: req.params.imageName })
    .then((image) => {
      res.status(200).contentType(image.img.contentType).send(image.img.data);
    })
    .catch(() => res.status(404).json({ message: 'Image not found' }));
};

exports.uploadImage = async (req, res) => {
  const folderPath = path.join(__dirname, '..', 'public', 'uploads');
  const filePath = path.join(folderPath, req.file.filename);
  const image = new Image({
    name: req.userData.username,
    img: {
      data: fs.readFileSync(filePath),
      contentType: req.file.mimetype
    }
  });
  await Image.exists({ name: image.name }).then(async (isExists) => {
    if (isExists) {
      await updateImageAsync(req, res, image);
    } else {
      fs.unlinkSync(filePath);
      await saveImageAsync(req, res, image);
    }
  });
};

async function saveImageAsync(req, res, image) {
  await image
    .save()
    .then(() => {
      res.status(200).json({
        message: 'Image uploaded successfully',
        url: `${process.env.BACKEND_URL}/image/${image.name}`
      });
    })
    .catch((err) => res.status(500).json({ message: 'Unknown error', stacktrace: req.userData.isAdmin ? err : '😊' }));
}

async function updateImageAsync(req, res, image) {
  await Image.findOneAndUpdate(
    {
      name: image.name
    },
    {
      img: image.img,
      createdAt: image.createdAt
    }
  )
    .then(() => {
      res.status(200).json({
        message: 'Image updated successfully',
        url: `${process.env.BACKEND_URL}/image/${image.name}`
      });
    })
    .catch((err) => {
      res.status(500).json({ message: 'Could not update image', stacktrace: req.userData.isAdmin ? err : '😊' });
    });
}
