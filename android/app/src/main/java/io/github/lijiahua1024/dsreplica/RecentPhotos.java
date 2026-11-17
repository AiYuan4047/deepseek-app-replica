package io.github.lijiahua1024.dsreplica;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Size;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class RecentPhotos {
    private static final Uri IMAGES = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL);
    private static final Map<String, String> IMAGE_HEADERS = Map.of(
        "Content-Security-Policy", "default-src 'none'; sandbox",
        "X-Content-Type-Options", "nosniff",
        "Cache-Control", "no-store");
    private final Map<String, Photo> photos = new ConcurrentHashMap<>();
    private final ContentResolver resolver;

    RecentPhotos(ContentResolver resolver) {
        this.resolver = resolver;
    }

    String list() {
        photos.clear();
        JSONArray result = new JSONArray();
        Bundle args = new Bundle();
        args.putInt(ContentResolver.QUERY_ARG_LIMIT, 20);
        args.putStringArray(ContentResolver.QUERY_ARG_SORT_COLUMNS,
            new String[]{MediaStore.Images.Media.DATE_ADDED, MediaStore.Images.Media._ID});
        args.putInt(ContentResolver.QUERY_ARG_SORT_DIRECTION, ContentResolver.QUERY_SORT_DIRECTION_DESCENDING);
        String[] columns = {MediaStore.Images.Media._ID, MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.MIME_TYPE};
        try (Cursor rows = resolver.query(IMAGES, columns, args, null)) {
            if (rows == null) return "[]";
            while (result.length() < 20 && rows.moveToNext()) {
                long id = rows.getLong(0);
                String key = Long.toString(id);
                String name = rows.getString(1);
                String type = rows.getString(2);
                if (name == null || type == null || !type.startsWith("image/")) continue;
                JSONObject photo = new JSONObject().put("id", key).put("name", name).put("type", type);
                photos.put(key, new Photo(ContentUris.withAppendedId(IMAGES, id), type));
                result.put(photo);
            }
        } catch (SecurityException | JSONException ignored) {
            photos.clear();
            return "[]";
        }
        return result.toString();
    }

    WebResourceResponse open(String id, boolean thumbnail) {
        Photo photo = photos.get(id);
        if (photo == null) return null;
        try {
            if (thumbnail) {
                Bitmap bitmap = resolver.loadThumbnail(photo.uri(), new Size(224, 224), null);
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                try {
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 88, output);
                } finally {
                    bitmap.recycle();
                }
                return image("image/jpeg", new ByteArrayInputStream(output.toByteArray()));
            }
            InputStream input = resolver.openInputStream(photo.uri());
            return input == null ? null : image(photo.type(), input);
        } catch (IOException | SecurityException ignored) {
            return null;
        }
    }

    private static WebResourceResponse image(String type, InputStream input) {
        return new WebResourceResponse(type, null, 200, "OK", IMAGE_HEADERS, input);
    }

    private record Photo(Uri uri, String type) {}
}
